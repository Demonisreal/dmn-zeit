import { randomUUID } from 'node:crypto';
import {
	sendVacationNoticesResultSchema,
	vacationAccountSchema,
	vacationLedgerEntrySchema,
	vacationNoticePageSchema,
	vacationNoticeSchema
} from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { grant, member, office, today, type Member, type Office } from '../absences/office';
import { expectContract, startApi, type Api } from '../auth/api';
import { signedIn } from '../helpers/desk';
import { insertId } from '../helpers/pg';

let api: Api;
let o: Office;
let elsewhere: Office;
let stranger: Member;

beforeAll(async () => {
	api = await startApi();
	o = await office(api);
	elsewhere = await office(api);
	stranger = await member(api, o.tenantId, 'Fritz Fremd', {
		role: 'team_lead',
		teamId: o.otherTeam,
		leads: o.otherTeam
	});
	await grant(api, o.worker, 2025, '5.00');
	await grant(api, o.worker, 2026, '30.00');
	await grant(api, o.colleague, 2026, '30.00');
	today(api, '2026-10-01T08:00:00Z');
});

afterAll(() => api.app.close());

const account = (employeeId: string) => `/employees/${employeeId}/vacation?year=2026`;

describe('GET /api/employees/:id/vacation', () => {
	it('shows entitlement, buckets and what is still free', async () => {
		const answer = await o.worker.desk.get(account(o.worker.employeeId));

		expect(answer.status).toBe(200);
		expectContract(vacationAccountSchema, answer.body);
		expect(answer.body).toMatchObject({
			employeeId: o.worker.employeeId,
			year: 2026,
			entitlement: {
				days: '30.00',
				explanations: [{ key: 'vacation.entitlement.full_year', params: { days: '30.00' } }]
			},
			buckets: [
				{
					year: 2025,
					remaining: '5.00',
					deadline: '2026-03-31',
					notice: null,
					// nobody told the person, so the carry-over outlives its deadline
					expiry: { decision: 'keep', explanation: { key: 'vacation.expiry.no_notice' } }
				},
				{ year: 2026, entitlement: '30.00', remaining: '30.00', deadline: '2027-03-31' }
			],
			pending: '0.00',
			available: '35.00'
		});
		expect(answer.body.ledger).toHaveLength(2);
	});

	it('counts an open request as pending, not as taken', async () => {
		const request = await o.worker.desk.post('/absences', {
			employeeId: o.worker.employeeId,
			type: 'vacation',
			startDate: '2026-10-12',
			endDate: '2026-10-13'
		});
		expect(request.status).toBe(201);

		const answer = await o.worker.desk.get(account(o.worker.employeeId));
		expect(answer.body).toMatchObject({ pending: '2.00', available: '33.00' });
		expect(answer.body.buckets[1]).toMatchObject({ taken: '0.00', remaining: '30.00' });
	});

	it('opens the account to the lead and hr, not to a colleague, another team or tenant', async () => {
		expect((await o.lead.desk.get(account(o.worker.employeeId))).status).toBe(200);
		expect((await o.hr.desk.get(account(o.worker.employeeId))).status).toBe(200);
		expect((await o.colleague.desk.get(account(o.worker.employeeId))).status).toBe(403);
		expect((await stranger.desk.get(account(o.worker.employeeId))).status).toBe(403);
		expect((await elsewhere.hr.desk.get(account(o.worker.employeeId))).status).toBe(404);
	});

	it('wants a year', async () => {
		const answer = await o.worker.desk.get(`/employees/${o.worker.employeeId}/vacation`);
		expect(answer.status).toBe(400);
	});
});

describe('POST /api/employees/:id/vacation/adjustments', () => {
	const adjustment = {
		bucketYear: 2026,
		days: '-1.50',
		effectiveDate: '2026-10-01',
		reason: 'Resturlaub aus Altvertrag korrigiert'
	};
	const path = (employeeId: string) => `/employees/${employeeId}/vacation/adjustments`;

	it('books a correction with its reason', async () => {
		const answer = await o.hr.desk.post(path(o.worker.employeeId), adjustment);

		expect(answer.status).toBe(201);
		expectContract(vacationLedgerEntrySchema, answer.body);
		expect(answer.body).toMatchObject({
			bucketYear: 2026,
			entryType: 'adjustment',
			days: '-1.50',
			reason: 'Resturlaub aus Altvertrag korrigiert'
		});
		const after = await o.worker.desk.get(account(o.worker.employeeId));
		expect(after.body.buckets[1]).toMatchObject({ adjusted: '-1.50', remaining: '28.50' });
	});

	it('is hr work, and never on the own account', async () => {
		expect((await o.lead.desk.post(path(o.worker.employeeId), adjustment)).status).toBe(403);
		expect((await o.worker.desk.post(path(o.worker.employeeId), adjustment)).status).toBe(403);
		const own = await o.hr.desk.post(path(o.hr.employeeId), adjustment);
		expect(own.status).toBe(403);
		expect(own.body.message).toBe('Bookings on your own account need a second person');
	});

	it('checks days, reason and person', async () => {
		const zero = await o.hr.desk.post(path(o.worker.employeeId), { ...adjustment, days: '0.00' });
		expect(zero.status).toBe(400);
		expect(zero.body.details[0]).toMatchObject({ message: 'vacation.zeroDays' });
		expect(
			(await o.hr.desk.post(path(o.worker.employeeId), { ...adjustment, reason: 'kurz' })).status
		).toBe(400);
		expect((await o.hr.desk.post(path(randomUUID()), adjustment)).status).toBe(404);
		expect((await elsewhere.hr.desk.post(path(o.worker.employeeId), adjustment)).status).toBe(404);
	});
});

describe('vacation notices', () => {
	let workerNotice: string;

	it('sends the forfeiture notice to several people at once and returns the receipt', async () => {
		const answer = await o.hr.desk.post('/vacation/notices', {
			bucketYear: 2026,
			employeeIds: [o.worker.employeeId, o.colleague.employeeId],
			channel: 'email'
		});

		expect(answer.status).toBe(201);
		expectContract(sendVacationNoticesResultSchema, answer.body);
		expect(answer.body.skipped).toEqual([]);
		// one batch shares its sent_at, the order within it follows the ids
		const sent = [...answer.body.sent].sort((a, b) =>
			a.employee.name.localeCompare(b.employee.name)
		);
		expect(sent).toEqual([
			expect.objectContaining({
				employee: { id: o.colleague.employeeId, name: 'Clara Kolleg' },
				remainingDays: '30.00',
				deadline: '2027-03-31',
				channel: 'email',
				textVersion: '2026-09-24',
				sentBy: { id: o.hr.userId, displayName: 'Hanna Personal' },
				acknowledgedAt: null
			}),
			expect.objectContaining({
				employee: { id: o.worker.employeeId, name: 'Wim Werner' },
				remainingDays: '28.50'
			})
		]);
		workerNotice = sent[1].id;

		await vi.waitFor(() =>
			expect(
				api.mails.filter((mail) => mail.subject === 'Hinweis zum Urlaubsverfall: Resturlaub 2026')
			).toHaveLength(2)
		);
		const mail = api.mails.find((mail) => mail.text.startsWith('Hallo Wim Werner'))!;
		expect(mail.text).toContain('noch 28,5 Urlaubstage');
		expect(mail.text).toContain('bis zum 31.03.2027');
	});

	it('shows the notice in the account of the person', async () => {
		const answer = await o.worker.desk.get(account(o.worker.employeeId));
		expect(answer.body.buckets[1].notice).toMatchObject({
			id: workerNotice,
			deadline: '2027-03-31'
		});
	});

	it('refuses a notice once the carry-over deadline has passed', async () => {
		const answer = await o.hr.desk.post('/vacation/notices', {
			bucketYear: 2025,
			employeeIds: [o.worker.employeeId],
			channel: 'in_app'
		});
		expect(answer.status).toBe(409);
		expect(answer.body.details).toEqual({ deadline: '2026-03-31' });
	});

	it('mails nobody it cannot reach, but a letter works for everyone', async () => {
		const offline = await insertId(
			api.superuser,
			`insert into app.employees (tenant_id, personnel_no, first_name, last_name, entry_date)
			 values ($1, 'P-OFF', 'Paul', 'Papier', '2025-01-01') returning id`,
			[o.tenantId]
		);
		const email = await o.hr.desk.post('/vacation/notices', {
			bucketYear: 2026,
			employeeIds: [offline],
			channel: 'email'
		});
		expect(email.status).toBe(409);
		expect(email.body.details).toEqual({ employeeIds: [offline] });

		const letter = await o.hr.desk.post('/vacation/notices', {
			bucketYear: 2026,
			employeeIds: [offline],
			channel: 'letter'
		});
		expect(letter.status).toBe(201);
		expect(letter.body.sent[0]).toMatchObject({ remainingDays: '0.00', channel: 'letter' });
	});

	it('is sent by hr only and for known people', async () => {
		const body = { bucketYear: 2026, employeeIds: [o.worker.employeeId], channel: 'in_app' };
		expect((await o.lead.desk.post('/vacation/notices', body)).status).toBe(403);
		const unknown = await o.hr.desk.post('/vacation/notices', {
			...body,
			employeeIds: [randomUUID()]
		});
		expect(unknown.status).toBe(404);
		expect((await elsewhere.hr.desk.post('/vacation/notices', body)).status).toBe(404);
	});

	it('lists the own notices, the team for the lead and everything for hr', async () => {
		const names = async (desk: Office['worker']['desk']) => {
			const answer = await desk.get('/vacation/notices?year=2026');
			expect(answer.status).toBe(200);
			expectContract(vacationNoticePageSchema, answer.body);
			return answer.body.items
				.map((notice: { employee: { name: string } }) => notice.employee.name)
				.sort();
		};
		expect(await names(o.worker.desk)).toEqual(['Wim Werner']);
		expect(await names(o.lead.desk)).toEqual(['Clara Kolleg', 'Wim Werner']);
		expect(await names(o.hr.desk)).toEqual(['Clara Kolleg', 'Paul Papier', 'Wim Werner']);
		expect(await names(o.outsider.desk)).toEqual([]);
		expect(await names(stranger.desk)).toEqual([]);
		expect(await names(elsewhere.hr.desk)).toEqual([]);
	});

	it('pages through the notices, newest first', async () => {
		const first = await o.hr.desk.get('/vacation/notices?year=2026&limit=2');
		expect(first.status).toBe(200);
		expect(first.body.items).toHaveLength(2);
		expect(first.body.items[0].employee.name).toBe('Paul Papier');
		expect(first.body.nextCursor).toEqual(expect.any(String));

		const rest = await o.hr.desk.get(
			`/vacation/notices?year=2026&limit=2&cursor=${first.body.nextCursor}`
		);
		expect(rest.body.items).toHaveLength(1);
		expect(rest.body.nextCursor).toBeNull();
		const ids = [...first.body.items, ...rest.body.items].map((notice) => notice.id);
		expect(new Set(ids).size).toBe(3);

		const broken = await o.hr.desk.get('/vacation/notices?year=2026&cursor=kaputt');
		expect(broken.status).toBe(400);
		expect(broken.body.details[0]).toMatchObject({ field: 'cursor' });
	});

	it('lets the person acknowledge the own notice once', async () => {
		const path = `/me/vacation/notices/${workerNotice}/acknowledge`;
		const answer = await o.worker.desk.post(path, {});

		expect(answer.status).toBe(200);
		expectContract(vacationNoticeSchema, answer.body);
		expect(answer.body.acknowledgedAt).toEqual(expect.any(String));
		expect((await o.worker.desk.post(path, {})).status).toBe(409);
		expect((await o.colleague.desk.post(path, {})).status).toBe(404);
		expect((await o.lead.desk.post(path, {})).status).toBe(404);
		expect((await o.hr.desk.post(path, {})).status).toBe(404);
	});

	it('skips who was told about the same year today and still serves the rest', async () => {
		const fresh = await office(api);
		await grant(api, fresh.worker, 2026, '30.00');
		const send = (employeeIds: string[], bucketYear = 2026) =>
			fresh.hr.desk.post('/vacation/notices', { bucketYear, employeeIds, channel: 'email' });
		const greeted = () =>
			api.mails
				.filter((mail) => mail.tenantId === fresh.tenantId)
				.map((mail) => mail.text.split(',')[0]);

		expect((await send([fresh.worker.employeeId])).status).toBe(201);
		const again = await send([fresh.worker.employeeId, fresh.colleague.employeeId]);

		expect(again.status).toBe(201);
		expectContract(sendVacationNoticesResultSchema, again.body);
		expect(again.body.skipped).toEqual([{ id: fresh.worker.employeeId, name: 'Wim Werner' }]);
		expect(again.body.sent).toEqual([
			expect.objectContaining({
				employee: { id: fresh.colleague.employeeId, name: 'Clara Kolleg' }
			})
		]);
		await vi.waitFor(() => expect(greeted()).toContain('Hallo Clara Kolleg'));
		expect(greeted().filter((line) => line === 'Hallo Wim Werner')).toHaveLength(1);
		const { rows } = await api.superuser.query(
			'select count(*)::int as n from app.vacation_notices where employee_id = $1',
			[fresh.worker.employeeId]
		);
		expect(rows[0].n).toBe(1);

		const nextYear = await send([fresh.worker.employeeId], 2027);
		expect(nextYear.body).toMatchObject({ sent: [expect.anything()], skipped: [] });
	});

	it('lets only one of several clicks at once through', async () => {
		const fresh = await office(api);
		const body = { bucketYear: 2026, employeeIds: [fresh.worker.employeeId], channel: 'in_app' };

		// two requests seldom overlap in here, five reliably do
		const clicks = await Promise.all(
			Array.from({ length: 5 }, () => fresh.hr.desk.post('/vacation/notices', body))
		);

		expect(clicks.map((click) => click.status)).toEqual([201, 201, 201, 201, 201]);
		expect(clicks.flatMap((click) => click.body.sent)).toHaveLength(1);
		expect(clicks.flatMap((click) => click.body.skipped)).toHaveLength(4);
	});

	it('lets one address send ten batches an hour', async () => {
		const desk = await signedIn(api, o.hr.userId);
		// the 2025 deadline has passed, so every batch counts without sending anything
		const late = { bucketYear: 2025, employeeIds: [o.worker.employeeId], channel: 'in_app' };
		for (let i = 0; i < 10; i++) {
			expect((await desk.post('/vacation/notices', late)).status).toBe(409);
		}

		const blocked = await desk.post('/vacation/notices', late);
		expect(blocked.status).toBe(429);
		expect(blocked.body.code).toBe('RATE_LIMITED');
	});
});
