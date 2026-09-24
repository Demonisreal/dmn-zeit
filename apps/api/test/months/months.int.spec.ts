import { monthChecklistSchema, monthClosingSchema, type Role } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MonthSnapshot } from '../../src/months/snapshot';
import { expectContract, startApi, type Api } from '../auth/api';
import { createPerson, createTeam, createTenant, type Person } from '../helpers/pg';
import { addEntry } from '../time/people';
import { book, closedThrough, currentMonth, hire, seat, type Seat } from './firm';

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(() => api.app.close());

// hr and admin without a personnel record, so only the hired people show up in a closing
async function firm() {
	const tenantId = await createTenant();
	return {
		tenantId,
		hr: await seat(api, tenantId, 'hr', { name: 'Hanna Personal' }),
		admin: await seat(api, tenantId, 'admin', { name: 'Anton Admin', reauth: true })
	};
}

async function capped(tenantId: string) {
	await api.superuser.query(
		`update app.tenants set flex_cap_plus_min = 300, flex_cap_minus_min = 120,
			flex_cap_mode = 'forfeit_at_close' where id = $1`,
		[tenantId]
	);
}

async function capBookings(tenantId: string) {
	const { rows } = await api.superuser.query<{
		employee_id: string;
		minutes: number;
		effective_date: string;
		month_closing_id: string;
	}>(
		`select employee_id, minutes, effective_date::text, month_closing_id
		   from app.flex_bookings where tenant_id = $1 and type = 'cap_forfeit' order by created_at, minutes`,
		[tenantId]
	);
	return rows;
}

async function snapshotOf(closingId: string) {
	const { rows } = await api.superuser.query<{ snapshot: MonthSnapshot }>(
		'select snapshot from app.month_closings where id = $1',
		[closingId]
	);
	return rows[0]!.snapshot;
}

const checklist = (desk: Seat['desk'], month: string) => desk.get(`/months/${month}/checklist`);
const close = (desk: Seat['desk'], month: string) => desk.post(`/months/${month}/close`);
const reopen = (desk: Seat['desk'], month: string, reason = 'Krankmeldung kam erst später') =>
	desk.post(`/months/${month}/reopen`, { reason });

describe('GET /api/months/:month/checklist', () => {
	it('finds nothing in a quiet past month and offers to close it', async () => {
		const f = await firm();
		await hire(api, f.tenantId, 'Wim Werner', { entryDate: '2026-03-01' });

		const answer = await checklist(f.hr.desk, '2026-03');
		expect(answer.status).toBe(200);
		expectContract(monthChecklistSchema, answer.body);
		expect(answer.body).toEqual({ month: '2026-03', closed: false, closable: true, items: [] });
	});

	it('blocks on running entries, open corrections and open absences of the month', async () => {
		const f = await firm();
		const wim = await hire(api, f.tenantId, 'Wim Werner', { entryDate: '2026-01-01' });
		const clara = await hire(api, f.tenantId, 'Clara Kolleg', { entryDate: '2026-01-01' });
		const otto = await hire(api, f.tenantId, 'Otto Aussen', { entryDate: '2026-01-01' });

		await addEntry(api, wim, '2026-03-10T08:00:00+01:00', null);
		const voided = await addEntry(
			api,
			otto,
			'2026-03-11T08:00:00+01:00',
			'2026-03-11T12:00:00+01:00'
		);
		await api.superuser.query(
			`insert into app.correction_requests
				(tenant_id, employee_id, action, target_entry_id, new_started_at, new_ended_at, reason, requested_by)
			 values ($1, $2, 'add', null, '2026-03-12 08:00+01', '2026-03-12 12:00+01', 'Kommen vergessen am Donnerstag', $3),
			        ($1, $4, 'void', $5, null, null, 'Doppelt gestempelt, bitte streichen', $6),
			        ($1, $2, 'add', null, '2026-04-02 08:00+02', '2026-04-02 12:00+02', 'Gehört in den April', $3)`,
			[f.tenantId, clara.employeeId, clara.userId, otto.employeeId, voided, otto.userId]
		);
		await api.superuser.query(
			`insert into app.absence_requests (tenant_id, employee_id, type, start_date, end_date, requested_by)
			 values ($1, $2, 'vacation', '2026-03-30', '2026-04-02', $3)`,
			[f.tenantId, clara.employeeId, clara.userId]
		);

		const answer = await checklist(f.hr.desk, '2026-03');
		expectContract(monthChecklistSchema, answer.body);
		expect(answer.body.closable).toBe(false);
		// the entry running since march is one endless shift, its findings come last and block nothing
		expect(answer.body.items[3]).toMatchObject({ kind: 'open_finding', blocking: false });
		expect(answer.body.items.slice(0, 3)).toEqual([
			{
				kind: 'running_entry',
				blocking: true,
				employees: [{ id: wim.employeeId, name: 'Wim Werner' }],
				explanation: { key: 'months.checklist.running_entry', params: { count: 1 } }
			},
			{
				kind: 'pending_correction',
				blocking: true,
				employees: [
					{ id: otto.employeeId, name: 'Otto Aussen' },
					{ id: clara.employeeId, name: 'Clara Kolleg' }
				],
				explanation: { key: 'months.checklist.pending_correction', params: { count: 2 } }
			},
			{
				kind: 'pending_absence',
				blocking: true,
				employees: [{ id: clara.employeeId, name: 'Clara Kolleg' }],
				explanation: { key: 'months.checklist.pending_absence', params: { count: 1 } }
			}
		]);

		// the entry still runs, so it holds up every month after its start as well
		const april = await checklist(f.hr.desk, '2026-04');
		expect(april.body.items.map((item: { kind: string }) => item.kind)).toEqual([
			'running_entry',
			'pending_correction',
			'pending_absence'
		]);
		const february = await checklist(f.hr.desk, '2026-02');
		expect(february.body).toMatchObject({ closable: true, items: [] });
	});

	it('points out unacknowledged findings without blocking', async () => {
		const f = await firm();
		const wim = await hire(api, f.tenantId, 'Wim Werner', { entryDate: '2026-03-01' });
		await addEntry(api, wim, '2026-03-08T10:00:00+01:00', '2026-03-08T12:00:00+01:00');

		const open = await checklist(f.hr.desk, '2026-03');
		expect(open.body.closable).toBe(true);
		expect(open.body.items).toEqual([
			{
				kind: 'open_finding',
				blocking: false,
				employees: [{ id: wim.employeeId, name: 'Wim Werner' }],
				explanation: { key: 'months.checklist.open_finding', params: { count: 1 } }
			}
		]);

		await api.superuser.query(
			`insert into app.finding_acks (tenant_id, employee_id, work_date, rule_code, rule_version, note, created_by)
			 values ($1, $2, '2026-03-08', 'ARBZG_9_SUNDAY', 'arbzg-1994', 'Inventur, so abgesprochen', $3)`,
			[f.tenantId, wim.employeeId, f.hr.userId]
		);
		expect((await checklist(f.hr.desk, '2026-03')).body.items).toEqual([]);
	});

	it('names the open month before, and knows what is closed', async () => {
		const f = await firm();
		expect((await close(f.hr.desk, '2026-01')).status).toBe(201);

		const march = await checklist(f.hr.desk, '2026-03');
		expect(march.body).toEqual({
			month: '2026-03',
			closed: false,
			closable: false,
			items: [
				{
					kind: 'previous_month_open',
					blocking: true,
					employees: [],
					explanation: {
						key: 'months.checklist.previous_month_open',
						params: { month: '2026-02' }
					}
				}
			]
		});
		expect((await checklist(f.hr.desk, '2026-02')).body).toMatchObject({
			closed: false,
			closable: true
		});
		const january = await checklist(f.hr.desk, '2026-01');
		expect(january.body).toMatchObject({ closed: true, closable: false, items: [] });
		// a first closing locks everything before it too
		expect((await checklist(f.hr.desk, '2025-11')).body.closed).toBe(true);
	});

	it('never offers the running month', async () => {
		const f = await firm();
		const answer = await checklist(f.hr.desk, currentMonth());
		expect(answer.body).toMatchObject({ closed: false, closable: false });
	});

	it('looks at the own tenant only', async () => {
		const f = await firm();
		const other = await firm();
		const wim = await hire(api, other.tenantId, 'Wim Werner', { entryDate: '2026-01-01' });
		await addEntry(api, wim, '2026-03-10T08:00:00+01:00', null);

		expect((await checklist(f.hr.desk, '2026-03')).body.items).toEqual([]);
		const own = await checklist(other.hr.desk, '2026-03');
		expect(own.body.items.map((item: { kind: string }) => item.kind)).toEqual([
			'running_entry',
			'open_finding'
		]);
	});

	it('checks the month in the path', async () => {
		const f = await firm();
		expect((await checklist(f.hr.desk, '2026-13')).status).toBe(400);
		expect((await checklist(f.hr.desk, 'maerz')).status).toBe(400);
	});
});

describe('POST /api/months/:month/close', () => {
	let tenantId: string;
	let hr: Seat;
	let admin: Seat;
	let over: Person;
	let under: Person;
	let ownCap: Person;
	let closingId: string;

	beforeAll(async () => {
		const f = await firm();
		({ tenantId, hr, admin } = f);
		await capped(tenantId);
		// one working day each: -480 against the target, the booking lifts two of them to +520
		over = await hire(api, tenantId, 'Otto Ueber', { entryDate: '2026-03-31' });
		under = await hire(api, tenantId, 'Ute Unter', { entryDate: '2026-03-31' });
		ownCap = await createPerson(tenantId, { entryDate: '2026-03-31' });
		await api.superuser.query(
			`with model as (
				insert into app.work_models (tenant_id, name, min_mon, min_tue, min_wed, min_thu, min_fri, min_sat, min_sun)
				values ($1, 'Vollzeit mit eigener Kappung', 480, 480, 480, 480, 480, 0, 0) returning id
			)
			insert into app.contracts (
				tenant_id, employee_id, valid_from, work_model_id,
				min_mon, min_tue, min_wed, min_thu, min_fri, min_sat, min_sun,
				vacation_days_year, vacation_basis_days, flex_cap_plus_min
			)
			select $1, $2, '2026-03-31', id, 480, 480, 480, 480, 480, 0, 0, 30, 5, 600 from model`,
			[tenantId, ownCap.employeeId]
		);
		await book(api, over, 1000, '2026-03-31');
		await book(api, ownCap, 1000, '2026-03-31');
	});

	it('books the cap into the month, then closes it with a snapshot of everyone', async () => {
		const answer = await close(hr.desk, '2026-03');

		expect(answer.status).toBe(201);
		expectContract(monthClosingSchema, answer.body);
		expect(answer.body).toMatchObject({
			month: '2026-03',
			action: 'close',
			reason: null,
			actor: { id: hr.userId, displayName: 'Hanna Personal' }
		});
		closingId = answer.body.id;
		expect(await closedThrough(api, over.employeeId)).toBe('2026-03-31');

		expect(await capBookings(tenantId)).toEqual([
			{
				employee_id: over.employeeId,
				minutes: -220,
				effective_date: '2026-03-31',
				month_closing_id: closingId
			},
			{
				employee_id: under.employeeId,
				minutes: 360,
				effective_date: '2026-03-31',
				month_closing_id: closingId
			}
		]);

		const { rows } = await api.superuser.query(
			'select snapshot from app.month_closings where id = $1',
			[closingId]
		);
		const figures = {
			targetMinutes: 480,
			workedMinutes: 0,
			creditedMinutes: 0,
			diffMinutes: -480,
			vacationDays: '0.00',
			sickDays: '0.00',
			openFindings: 0
		};
		expect(rows[0].snapshot).toEqual({
			ruleVersions: ['arbzg-1994'],
			employees: {
				[over.employeeId]: { ...figures, flexBalanceMinutes: 300 },
				[under.employeeId]: { ...figures, flexBalanceMinutes: -120 },
				[ownCap.employeeId]: { ...figures, flexBalanceMinutes: 520 }
			}
		});

		const trail = await api.superuser.query(
			`select table_name, action, actor_user_id from audit.log
			  where tenant_id = $1 and table_name in ('month_closings', 'flex_bookings') and actor_user_id = $2`,
			[tenantId, hr.userId]
		);
		expect(trail.rows.map((row) => row.table_name).sort()).toEqual([
			'flex_bookings',
			'flex_bookings',
			'month_closings'
		]);
	});

	it('answers a second click with 409 and books nothing twice', async () => {
		const again = await close(hr.desk, '2026-03');
		expect(again.status).toBe(409);
		expect(again.body.code).toBe('INVALID_STATE');
		expect(await capBookings(tenantId)).toHaveLength(2);
	});

	it('closes only the month right after the last closed one, never the running one', async () => {
		const skipped = await close(hr.desk, '2026-05');
		expect(skipped.status).toBe(409);
		expect(skipped.body.code).toBe('INVALID_STATE');
		const running = await close(hr.desk, currentMonth());
		expect(running.body.code).toBe('INVALID_STATE');
		expect(await capBookings(tenantId)).toHaveLength(2);
		expect(await closedThrough(api, over.employeeId)).toBe('2026-03-31');
	});

	it('lets only one of two parallel clicks through', async () => {
		const f = await firm();
		await capped(f.tenantId);
		const wim = await hire(api, f.tenantId, 'Wim Werner', { entryDate: '2026-03-31' });
		await book(api, wim, 1000, '2026-03-31');

		const answers = await Promise.all([close(f.hr.desk, '2026-03'), close(f.hr.desk, '2026-03')]);
		expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
		expect(await capBookings(f.tenantId)).toHaveLength(1);
	});

	it('refuses while blocking points are open', async () => {
		const f = await firm();
		const wim = await hire(api, f.tenantId, 'Wim Werner', { entryDate: '2026-01-01' });
		await addEntry(api, wim, '2026-03-10T08:00:00+01:00', null);

		const answer = await close(f.hr.desk, '2026-03');
		expect(answer.status).toBe(409);
		expect(answer.body).toMatchObject({
			code: 'INVALID_STATE',
			details: { kinds: ['running_entry'] }
		});
		expect(await closedThrough(api, wim.employeeId)).toBeNull();
	});

	it('is for hr and admins', async () => {
		const f = await firm();
		const team = await createTeam(f.tenantId);
		const lead = await hire(api, f.tenantId, 'Lena Leitung', {
			role: 'team_lead',
			teamId: team,
			leads: team,
			entryDate: '2026-01-01'
		});
		const wim = await hire(api, f.tenantId, 'Wim Werner', {
			teamId: team,
			entryDate: '2026-01-01'
		});

		for (const desk of [wim.desk, lead.desk]) {
			expect((await close(desk, '2026-01')).status).toBe(403);
			expect((await checklist(desk, '2026-01')).status).toBe(403);
		}
		expect(await closedThrough(api, wim.employeeId)).toBeNull();
		expect((await close(f.admin.desk, '2026-01')).status).toBe(201);
		expect((await close(f.hr.desk, '2026-02')).status).toBe(201);
		expect((await checklist(f.admin.desk, '2026-02')).status).toBe(200);
	});

	describe('POST /api/months/:month/reopen', () => {
		it('opens the last closed month again and books the cap back', async () => {
			const answer = await reopen(admin.desk, '2026-03');

			expect(answer.status).toBe(201);
			expectContract(monthClosingSchema, answer.body);
			expect(answer.body).toMatchObject({
				month: '2026-03',
				action: 'reopen',
				reason: 'Krankmeldung kam erst später',
				actor: { id: admin.userId, displayName: 'Anton Admin' }
			});
			expect(await closedThrough(api, over.employeeId)).toBeNull();

			const bookings = await capBookings(tenantId);
			expect(bookings.slice(2)).toEqual([
				{
					employee_id: under.employeeId,
					minutes: -360,
					effective_date: '2026-03-31',
					month_closing_id: answer.body.id
				},
				{
					employee_id: over.employeeId,
					minutes: 220,
					effective_date: '2026-03-31',
					month_closing_id: answer.body.id
				}
			]);
		});

		it('caps afresh when the month is closed again', async () => {
			const again = await close(hr.desk, '2026-03');
			expect(again.status).toBe(201);
			const bookings = await capBookings(tenantId);
			expect(bookings).toHaveLength(6);
			const net = (employeeId: string) =>
				bookings
					.filter((booking) => booking.employee_id === employeeId)
					.reduce((sum, booking) => sum + booking.minutes, 0);
			expect(net(over.employeeId)).toBe(-220);
			expect(net(under.employeeId)).toBe(360);
		});

		it('opens only the last closed month', async () => {
			const f = await firm();
			expect((await close(f.hr.desk, '2026-01')).status).toBe(201);
			expect((await close(f.hr.desk, '2026-02')).status).toBe(201);

			const older = await reopen(f.admin.desk, '2026-01');
			expect(older.status).toBe(409);
			expect(older.body.code).toBe('INVALID_STATE');
			expect((await reopen(f.admin.desk, '2026-04')).body.code).toBe('INVALID_STATE');
			expect((await reopen(f.admin.desk, '2026-02')).status).toBe(201);
			expect((await reopen(f.admin.desk, '2026-01')).status).toBe(201);
		});

		it('wants an admin who confirmed a moment ago, and a reason', async () => {
			const f = await firm();
			const wim = await hire(api, f.tenantId, 'Wim Werner', { entryDate: '2026-01-01' });
			expect((await close(f.hr.desk, '2026-01')).status).toBe(201);

			const unconfirmed = await seat(api, f.tenantId, 'admin');
			const stale = await reopen(unconfirmed.desk, '2026-01');
			expect(stale.status).toBe(403);
			expect(stale.body.code).toBe('REAUTH_REQUIRED');

			const hrConfirmed = await seat(api, f.tenantId, 'hr', { reauth: true });
			for (const desk of [wim.desk, f.hr.desk, hrConfirmed.desk]) {
				const refused = await reopen(desk, '2026-01');
				expect(refused.status).toBe(403);
				expect(refused.body.code).toBe('FORBIDDEN');
			}

			expect((await f.admin.desk.post('/months/2026-01/reopen', {})).status).toBe(400);
			expect((await reopen(f.admin.desk, '2026-01', 'weil')).status).toBe(400);
			expect(await closedThrough(api, wim.employeeId)).toBe('2026-01-31');
			expect((await reopen(f.admin.desk, '2026-01')).status).toBe(201);
			expect(await closedThrough(api, wim.employeeId)).toBeNull();
		});
	});
});

describe('balance carried over from december', () => {
	// one working day in december: -480 against the target, the booking lifts the first to +520
	async function lastYear() {
		const f = await firm();
		const plus = await hire(api, f.tenantId, 'Otto Ueber', { entryDate: '2025-12-31' });
		const minus = await hire(api, f.tenantId, 'Ute Unter', { entryDate: '2025-12-31' });
		await book(api, plus, 1000, '2025-12-31');
		const december = await close(f.hr.desk, '2025-12');
		expect(december.status).toBe(201);
		return { ...f, plus, minus, december: december.body.id as string };
	}

	it('starts the new year from what the december closing froze', async () => {
		const f = await lastYear();
		const january = await close(f.hr.desk, '2026-01');
		const february = await close(f.hr.desk, '2026-02');

		expect((await snapshotOf(f.december)).employees).toMatchObject({
			[f.plus.employeeId]: { flexBalanceMinutes: 520 },
			[f.minus.employeeId]: { flexBalanceMinutes: -480 }
		});
		// 21 working days in january, 20 in february, and nobody worked a minute
		expect((await snapshotOf(january.body.id)).employees).toMatchObject({
			[f.plus.employeeId]: { diffMinutes: -10080, flexBalanceMinutes: -9560 },
			[f.minus.employeeId]: { diffMinutes: -10080, flexBalanceMinutes: -10560 }
		});
		expect((await snapshotOf(february.body.id)).employees).toMatchObject({
			[f.plus.employeeId]: { diffMinutes: -9600, flexBalanceMinutes: -19160 },
			[f.minus.employeeId]: { diffMinutes: -9600, flexBalanceMinutes: -20160 }
		});
	});

	it('caps the balance with the carry-over in it', async () => {
		const f = await lastYear();
		// capped from january on only, so december hands over its +520 and -480 in full
		await capped(f.tenantId);
		// january alone ends at +200 and 0, both well inside +300 and -120
		await book(api, f.plus, 10280, '2026-01-31');
		await book(api, f.minus, 10080, '2026-01-31');

		const january = await close(f.hr.desk, '2026-01');
		expect(january.status).toBe(201);
		expect(await capBookings(f.tenantId)).toEqual([
			{
				employee_id: f.plus.employeeId,
				minutes: -420,
				effective_date: '2026-01-31',
				month_closing_id: january.body.id
			},
			{
				employee_id: f.minus.employeeId,
				minutes: 360,
				effective_date: '2026-01-31',
				month_closing_id: january.body.id
			}
		]);
		expect((await snapshotOf(january.body.id)).employees).toMatchObject({
			[f.plus.employeeId]: { flexBalanceMinutes: 300 },
			[f.minus.employeeId]: { flexBalanceMinutes: -120 }
		});
	});
});

describe('role matrix for months', () => {
	const cases: [Role, number, number, number][] = [
		['employee', 403, 403, 403],
		['team_lead', 403, 403, 403],
		['hr', 200, 201, 403],
		['admin', 200, 201, 201]
	];

	it.each(cases)('%s: checklist %i, close %i, reopen %i', async (role, list, closing, opening) => {
		const f = await firm();
		const desk = (await seat(api, f.tenantId, role, { reauth: true })).desk;
		expect((await checklist(desk, '2026-01')).status).toBe(list);
		expect((await close(desk, '2026-01')).status).toBe(closing);
		if (closing !== 201) await close(f.hr.desk, '2026-01');
		expect((await reopen(desk, '2026-01')).status).toBe(opening);
	});
});
