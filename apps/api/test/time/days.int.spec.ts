import { dayRangeSchema } from '@zeit/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api, type Browser } from '../auth/api';
import {
	createContract,
	createPerson,
	createTeam,
	createTenant,
	createUser,
	insertId,
	type Account,
	type Person
} from '../helpers/pg';
import { addEntry, closeMonth, signedIn } from './people';

let api: Api;
let tenant: string;
let worker: Person & { browser: Browser };
let lead: Person & { browser: Browser };
let hr: Account & { browser: Browser };
let outsider: Person;

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	const team = await createTeam(tenant);
	worker = await signedIn(api, await createPerson(tenant, { teamId: team }));
	lead = await signedIn(
		api,
		await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team })
	);
	hr = await signedIn(api, await createUser(tenant, { role: 'hr' }));
	outsider = await createPerson(tenant);
	await createContract(tenant, worker.employeeId);

	await addEntry(api, worker, '2026-09-21T14:00:00+02:00', '2026-09-21T23:00:00+02:00');
	await addEntry(api, worker, '2026-09-22T07:00:00+02:00', '2026-09-22T11:00:00+02:00');
	const vacation = await insertId(
		api.superuser,
		`insert into app.absence_requests
		   (tenant_id, employee_id, type, start_date, end_date, status, requested_by, decided_by, decided_at)
		 values ($1, $2, 'vacation', '2026-09-25', '2026-09-25', 'approved', $3, $3, now()) returning id`,
		[tenant, worker.employeeId, hr.userId]
	);
	await api.superuser.query(
		`insert into app.absence_days (tenant_id, employee_id, absence_id, date, portion, target_minutes, vacation_days)
		 values ($1, $2, $3, '2026-09-25', 1, 480, 1)`,
		[tenant, worker.employeeId, vacation]
	);
	await closeMonth(api, tenant, '2026-01-01', hr.userId);
});

afterAll(() => api.app.close());

const days = (browser: Browser, employeeId: string, query: string) =>
	browser.get(`/employees/${employeeId}/days?${query}`);

describe('GET /api/employees/:id/days', () => {
	it('builds a week from entries, target and absence', async () => {
		const answer = await days(worker.browser, worker.employeeId, 'from=2026-09-21&to=2026-09-27');

		expect(answer.status).toBe(200);
		const week = dayRangeSchema.parse(answer.body);
		expect(week).toMatchObject({
			employeeId: worker.employeeId,
			from: '2026-09-21',
			to: '2026-09-27'
		});
		expect(week.days.map((day) => [day.date, day.workedMinutes, day.diffMinutes])).toEqual([
			['2026-09-21', 540, 60],
			['2026-09-22', 240, -240],
			['2026-09-23', 0, -480],
			['2026-09-24', 0, -480],
			['2026-09-25', 0, 0],
			['2026-09-26', 0, 0],
			['2026-09-27', 0, 0]
		]);
		expect(week.days[4]).toMatchObject({
			creditedMinutes: 480,
			absence: { type: 'vacation', status: 'approved', portion: 1 }
		});
		expect(week.totals).toEqual({
			targetMinutes: 2400,
			workedMinutes: 780,
			creditedMinutes: 480,
			diffMinutes: -1140
		});
	});

	it('reports the short rest after a late shift, also when only the second day is asked for', async () => {
		const week = await days(worker.browser, worker.employeeId, 'from=2026-09-21&to=2026-09-22');
		expect(week.body.days[0].findings.map((finding: { code: string }) => finding.code)).toEqual([
			'ARBZG_3_OVER_8',
			'ARBZG_4_BREAK_SHORT',
			'ARBZG_4_CONTINUOUS_6H'
		]);

		const single = await days(worker.browser, worker.employeeId, 'from=2026-09-22&to=2026-09-22');
		expect(single.body.days[0].findings).toEqual([
			expect.objectContaining({
				code: 'ARBZG_5_REST_UNDER_11H',
				facts: { restMinutes: 480 },
				ack: null
			})
		]);
	});

	it('takes the target off a public holiday of the tenant state', async () => {
		const answer = await days(worker.browser, worker.employeeId, 'from=2026-06-04&to=2026-06-04');
		expect(answer.body.days[0]).toMatchObject({
			target: { minutes: 0, explanation: { key: 'target.holiday' } },
			holiday: { code: 'corpus_christi', portion: 1 }
		});
	});

	it('marks the days of a closed month', async () => {
		const answer = await days(worker.browser, worker.employeeId, 'from=2026-01-30&to=2026-02-02');
		expect(answer.body.closedThrough).toBe('2026-01-31');
		expect(answer.body.days.map((day: { locked: boolean }) => day.locked)).toEqual([
			true,
			true,
			false,
			false
		]);
	});

	it('shows the team to its lead, keeps strangers out and says so for unknown people', async () => {
		expect(
			(await days(lead.browser, worker.employeeId, 'from=2026-09-21&to=2026-09-27')).status
		).toBe(200);
		expect(
			(await days(worker.browser, outsider.employeeId, 'from=2026-09-21&to=2026-09-27')).status
		).toBe(403);
		expect(
			(await days(lead.browser, outsider.employeeId, 'from=2026-09-21&to=2026-09-27')).status
		).toBe(403);

		const unknown = await days(hr.browser, randomUUID(), 'from=2026-09-21&to=2026-09-27');
		expect(unknown.status).toBe(404);
		expect(unknown.body.code).toBe('NOT_FOUND');
	});

	it('takes a date range, not a month, and at most 62 days', async () => {
		expect((await days(worker.browser, worker.employeeId, 'month=2026-09')).status).toBe(400);

		const tooLong = await days(worker.browser, worker.employeeId, 'from=2026-01-01&to=2026-03-04');
		expect(tooLong.status).toBe(400);
		expect(tooLong.body.details[0]).toMatchObject({ field: 'to', message: 'range.tooLong' });
	});
});
