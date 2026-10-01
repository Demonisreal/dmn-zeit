import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { monthOverviewSchema, timesheetSchema, type Role } from '@zeit/shared';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectContract, startApi, type Api } from '../auth/api';
import { createTeam, createTenant } from '../helpers/pg';
import { absentOn, book, hire, seat, type Hire, type Seat } from '../months/firm';
import { addEntry } from '../time/people';

let api: Api;
let tenantId: string;
let hr: Seat;
let hrEn: Seat;
let admin: Seat;
let lead: Hire;
let wim: Hire;
let clara: Hire;
let otto: Hire;
let stranger: Seat;

const golden = (name: string) => readFile(new URL(`./golden/${name}`, import.meta.url));

// the bytes as sent, decoding them as text could quietly drop the byte order mark
function raw(test: request.Test) {
	return test.buffer(true).parse((res, done) => {
		const chunks: Buffer[] = [];
		res.on('data', (chunk: Buffer) => chunks.push(chunk));
		res.on('end', () => done(null, Buffer.concat(chunks)));
	});
}

beforeAll(async () => {
	api = await startApi();
	tenantId = await createTenant();
	const bookkeeping = await createTeam(tenantId);
	const payroll = await createTeam(tenantId, 'Lohn');
	hr = await seat(api, tenantId, 'hr', { name: 'Hanna Personal', locale: 'de' });
	hrEn = await seat(api, tenantId, 'hr', { name: 'Harriet Payroll', locale: 'en' });
	admin = await seat(api, tenantId, 'admin');
	// starts in may, so the lead leads the team in april without a row of her own
	lead = await hire(api, tenantId, 'Lena Leitung', {
		role: 'team_lead',
		leads: bookkeeping,
		entryDate: '2026-05-01'
	});
	wim = await hire(api, tenantId, 'Wim Werner', {
		teamId: bookkeeping,
		entryDate: '2026-04-01',
		personnelNo: 'P-100'
	});
	clara = await hire(api, tenantId, '=SUM(A1) Kolleg', {
		teamId: bookkeeping,
		entryDate: '2026-04-01',
		personnelNo: '@P-200'
	});
	otto = await hire(api, tenantId, 'Otto Aussen', {
		teamId: payroll,
		entryDate: '2026-04-01',
		personnelNo: 'P-300'
	});

	await addEntry(api, wim, '2026-04-01T08:00:00+02:00', '2026-04-01T12:00:00+02:00');
	await addEntry(api, wim, '2026-04-01T12:30:00+02:00', '2026-04-01T16:30:00+02:00');
	// nine hours in one go: over eight, no break, more than six at a stretch
	await addEntry(api, wim, '2026-04-02T08:00:00+02:00', '2026-04-02T17:00:00+02:00');
	await absentOn(api, wim, 'vacation', '2026-04-07', hr.userId);
	await absentOn(api, wim, 'sick', '2026-04-09', hr.userId);

	const elsewhere = await createTenant();
	stranger = await seat(api, elsewhere, 'hr');
	await hire(api, elsewhere, 'Frieda Fremd', { entryDate: '2026-04-01' });
});

afterAll(() => api.app.close());

const timesheet = (desk: Seat['desk'], employee: string, format = 'json', month = '2026-04') =>
	desk.get(`/exports/timesheet?employee=${employee}&month=${month}&format=${format}`);
const overview = (desk: Seat['desk'], format = 'json', month = '2026-04') =>
	desk.get(`/exports/month-overview?month=${month}&format=${format}`);

describe('GET /api/exports/timesheet', () => {
	it('lays out every day of an open month with entries, breaks, absences and holidays', async () => {
		const answer = await timesheet(wim.desk, wim.employeeId);

		expect(answer.status).toBe(200);
		expectContract(timesheetSchema, answer.body);
		expect(answer.body).toMatchObject({
			tenant: { name: 'Steuerbüro Beispiel', state: 'NW' },
			employee: { id: wim.employeeId, name: 'Wim Werner', personnelNo: 'P-100' },
			month: '2026-04',
			closed: false,
			totals: {
				targetMinutes: 9600,
				workedMinutes: 1020,
				creditedMinutes: 960,
				diffMinutes: -7620
			},
			flexBalanceMinutes: -7620
		});
		expect(answer.body.days).toHaveLength(30);
		expect(answer.body.days[0]).toEqual({
			date: '2026-04-01',
			entries: [
				{ startedAt: '2026-04-01T06:00:00Z', endedAt: '2026-04-01T10:00:00Z' },
				{ startedAt: '2026-04-01T10:30:00Z', endedAt: '2026-04-01T14:30:00Z' }
			],
			breakMinutes: 30,
			targetMinutes: 480,
			workedMinutes: 480,
			creditedMinutes: 0,
			diffMinutes: 0,
			absence: null,
			holiday: null
		});
		expect(answer.body.days[2]).toMatchObject({ targetMinutes: 0, holiday: 'good_friday' });
		expect(answer.body.days[6]).toMatchObject({
			creditedMinutes: 480,
			absence: { type: 'vacation', portion: 1 }
		});
		expect(answer.body.days[8].absence).toEqual({ type: 'sick', portion: 1 });
	});

	it('writes the csv byte for byte, with the separator of the reader', async () => {
		const answer = await raw(timesheet(hrEn.desk, wim.employeeId, 'csv'));

		expect(answer.status).toBe(200);
		expect(answer.headers['content-type']).toBe('text/csv; charset=utf-8');
		expect(answer.headers['content-disposition']).toBe(
			`attachment; filename="timesheet-2026-04-P-100.csv"; filename*=UTF-8''timesheet-2026-04-P-100.csv`
		);
		const expected = await golden('timesheet-2026-04.csv');
		expect(answer.body.toString('utf8')).toBe(expected.toString('utf8'));
		expect(answer.body.equals(expected)).toBe(true);
	});

	it('keeps the personnel number from bending the file name', async () => {
		const answer = await raw(timesheet(hr.desk, clara.employeeId, 'csv'));
		expect(answer.headers['content-disposition']).toBe(
			`attachment; filename="timesheet-2026-04-_P-200.csv"; filename*=UTF-8''timesheet-2026-04-_P-200.csv`
		);
		expect(answer.body.toString('utf8').split('\r\n')[1]).toBe('2026-04-01;;0;480;0;0;-480;;;;');
	});

	it('gives people their own sheet, leads their team and hr everyone', async () => {
		expect((await timesheet(wim.desk, clara.employeeId)).status).toBe(403);
		expect((await timesheet(wim.desk, otto.employeeId, 'csv')).status).toBe(403);
		expect((await timesheet(lead.desk, wim.employeeId)).status).toBe(200);
		expect((await timesheet(lead.desk, clara.employeeId, 'csv')).status).toBe(200);
		expect((await timesheet(lead.desk, otto.employeeId)).status).toBe(403);
		expect((await timesheet(hr.desk, otto.employeeId)).status).toBe(200);
		expect((await timesheet(admin.desk, otto.employeeId)).status).toBe(200);
	});

	it('knows nobody outside the own tenant', async () => {
		expect((await timesheet(stranger.desk, wim.employeeId)).status).toBe(404);
		expect((await timesheet(stranger.desk, wim.employeeId, 'csv')).status).toBe(404);
		expect((await timesheet(hr.desk, randomUUID())).status).toBe(404);
		expect((await timesheet(lead.desk, randomUUID())).status).toBe(403);
	});

	it('checks the query', async () => {
		expect((await timesheet(hr.desk, 'wim')).status).toBe(400);
		expect((await timesheet(hr.desk, wim.employeeId, 'xlsx')).status).toBe(400);
		expect((await timesheet(hr.desk, wim.employeeId, 'json', '2026-4')).status).toBe(400);
	});
});

describe('GET /api/exports/month-overview', () => {
	it('sums up every person employed in the month', async () => {
		const answer = await overview(hr.desk);

		expect(answer.status).toBe(200);
		expectContract(monthOverviewSchema, answer.body);
		expect(answer.body.closed).toBe(false);
		const idle = {
			targetMinutes: 9600,
			workedMinutes: 0,
			creditedMinutes: 0,
			diffMinutes: -9600,
			flexBalanceMinutes: -9600,
			vacationDays: '0.00',
			sickDays: '0.00',
			openFindings: 0
		};
		expect(answer.body.rows).toEqual([
			{ employee: { id: otto.employeeId, name: 'Otto Aussen', personnelNo: 'P-300' }, ...idle },
			{
				employee: { id: clara.employeeId, name: '=SUM(A1) Kolleg', personnelNo: '@P-200' },
				...idle
			},
			{
				employee: { id: wim.employeeId, name: 'Wim Werner', personnelNo: 'P-100' },
				targetMinutes: 9600,
				workedMinutes: 1020,
				creditedMinutes: 960,
				diffMinutes: -7620,
				flexBalanceMinutes: -7620,
				vacationDays: '1.00',
				sickDays: '1.00',
				openFindings: 3
			}
		]);
	});

	it('writes the csv byte for byte, with the separator of the reader', async () => {
		const answer = await raw(overview(hr.desk, 'csv'));

		expect(answer.status).toBe(200);
		expect(answer.headers['content-type']).toBe('text/csv; charset=utf-8');
		expect(answer.headers['content-disposition']).toBe(
			`attachment; filename="month-overview-2026-04.csv"; filename*=UTF-8''month-overview-2026-04.csv`
		);
		const expected = await golden('month-overview-2026-04.csv');
		expect(answer.body.toString('utf8')).toBe(expected.toString('utf8'));
		expect(answer.body.equals(expected)).toBe(true);
	});

	it('stays with hr, and within the own tenant', async () => {
		for (const desk of [wim.desk, lead.desk]) {
			expect((await overview(desk)).status).toBe(403);
			expect((await overview(desk, 'csv')).status).toBe(403);
		}
		expect((await overview(admin.desk)).status).toBe(200);
		const foreign = await overview(stranger.desk);
		expect(
			foreign.body.rows.map((row: { employee: { name: string } }) => row.employee.name)
		).toEqual(['Frieda Fremd']);
	});

	it('checks the query', async () => {
		expect((await overview(hr.desk, 'json', 'april')).status).toBe(400);
		expect((await overview(hr.desk, 'pdf')).status).toBe(400);
	});
});

describe('exports of a closed month', () => {
	beforeAll(async () => {
		const closing = await hr.desk.post('/months/2026-04/close');
		expect(closing.status).toBe(201);
	});

	it('marks the month closed and keeps the same numbers and bytes', async () => {
		const sheet = await timesheet(hr.desk, wim.employeeId);
		expect(sheet.body).toMatchObject({ closed: true, flexBalanceMinutes: -7620 });
		expect((await overview(hr.desk)).body.closed).toBe(true);

		const csv = await raw(timesheet(hrEn.desk, wim.employeeId, 'csv'));
		expect(csv.body.equals(await golden('timesheet-2026-04.csv'))).toBe(true);
		const summary = await raw(overview(hr.desk, 'csv'));
		expect(summary.body.equals(await golden('month-overview-2026-04.csv'))).toBe(true);
	});

	it('reads the snapshot, not what the people records say today', async () => {
		// an exit dated back afterwards would cut the target of the second half of april
		await api.superuser.query(`update app.employees set exit_date = '2026-04-15' where id = $1`, [
			wim.employeeId
		]);
		try {
			const answer = await overview(hr.desk);
			expect(answer.body.rows[2]).toMatchObject({
				targetMinutes: 9600,
				flexBalanceMinutes: -7620
			});
			// the closings are hr only, people and their leads get the one row through month_snapshot
			for (const desk of [hr.desk, wim.desk, lead.desk]) {
				const sheet = await timesheet(desk, wim.employeeId);
				expect(sheet.body).toMatchObject({ closed: true, flexBalanceMinutes: -7620 });
			}
		} finally {
			await api.superuser.query('update app.employees set exit_date = null where id = $1', [
				wim.employeeId
			]);
		}
	});
});

describe('exports after a closed december', () => {
	it('carry its balance into the open months of the new year', async () => {
		const firm = await createTenant();
		const hanna = await seat(api, firm, 'hr');
		// one working day in december at -480, the booking leaves +520 to carry over
		const ute = await hire(api, firm, 'Ute Unter', { entryDate: '2025-12-31' });
		await book(api, ute, 1000, '2025-12-31');
		expect((await hanna.desk.post('/months/2025-12/close')).status).toBe(201);

		const sheet = await timesheet(ute.desk, ute.employeeId, 'json', '2026-01');
		expect(sheet.body).toMatchObject({
			closed: false,
			totals: { diffMinutes: -10080 },
			flexBalanceMinutes: -9560
		});
		const summary = await overview(hanna.desk, 'json', '2026-01');
		expect(summary.body).toMatchObject({
			closed: false,
			rows: [{ diffMinutes: -10080, flexBalanceMinutes: -9560 }]
		});
	});
});

describe('GET /api/exports/time-report', () => {
	it('marks the report of a sandbox as specimen by tenants.kind, with APP_MODE=test', async () => {
		expect(process.env.APP_MODE).toBe('test');
		const report = async (tenant: string) => {
			const { desk } = await seat(api, tenant, 'hr');
			const client = (await desk.post('/clients', { name: 'Bäckerei Korn' })).body;
			const answer = await desk.get(
				`/exports/time-report?client=${client.id}&from=2026-04-01&to=2026-04-30&format=json`
			);
			expect(answer.status).toBe(200);
			return answer.body;
		};

		expect((await report(await createTenant({ kind: 'sandbox' }))).specimen).toBe(true);
		expect((await report(tenantId)).specimen).toBe(false);
	});
});

describe('role matrix for exports', () => {
	const cases: [Role, number, number][] = [
		['employee', 403, 403],
		['team_lead', 403, 403],
		['hr', 200, 200],
		['admin', 200, 200]
	];

	it.each(cases)("%s: someone else's timesheet %i, month overview %i", async (role, sheet, sum) => {
		const desk = (await seat(api, tenantId, role)).desk;
		expect((await timesheet(desk, otto.employeeId)).status).toBe(sheet);
		expect((await overview(desk)).status).toBe(sum);
	});
});
