import { clockSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api } from '../auth/api';
import { createPerson, createTenant, createUser } from '../helpers/pg';
import { signedIn } from './people';

let api: Api;
let tenant: string;

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
});

afterAll(() => api.app.close());

const worker = async () => signedIn(api, await createPerson(tenant));

describe('clock', () => {
	it('goes through in, break, resume and out, each stamp at the time of the database', async () => {
		const { browser, employeeId } = await worker();

		const off = await browser.get('/clock');
		expect(off.status).toBe(200);
		expect(off.body).toEqual({
			state: 'off',
			workday: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
			workedMinutes: 0
		});

		const working = await browser.post('/clock/in');
		expect(working.status).toBe(200);
		expect(clockSchema.parse(working.body)).toMatchObject({
			state: 'working',
			workday: off.body.workday
		});

		const onBreak = await browser.post('/clock/break');
		expect(onBreak.status).toBe(200);
		expect(onBreak.body).toMatchObject({ state: 'on_break', since: expect.any(String) });

		expect((await browser.post('/clock/resume')).body).toMatchObject({ state: 'working' });
		expect((await browser.post('/clock/out')).body).toMatchObject({ state: 'off' });

		const { rows } = await api.superuser.query(
			`select source, end_reason, started_at < ended_at as ordered
			   from app.time_entries where employee_id = $1 order by started_at`,
			[employeeId]
		);
		expect(rows).toEqual([
			{ source: 'clock', end_reason: 'break', ordered: true },
			{ source: 'clock', end_reason: 'leave', ordered: true }
		]);
	});

	it('ends the day at the start of the break when the person leaves from it', async () => {
		const { browser, employeeId } = await worker();
		await browser.post('/clock/in');
		const onBreak = await browser.post('/clock/break');

		const out = await browser.post('/clock/out');
		expect(out.status).toBe(200);
		expect(out.body).toEqual({
			state: 'off',
			workday: onBreak.body.workday,
			workedMinutes: onBreak.body.workedMinutes
		});

		const again = await browser.post('/clock/out');
		expect(again.status).toBe(409);
		expect(again.body).toMatchObject({ code: 'INVALID_STATE', message: 'Not clocked in' });
		expect((await browser.post('/clock/resume')).status).toBe(409);

		const { rows } = await api.superuser.query(
			`select end_reason, ended_at = $2::timestamptz as at_break
			   from app.time_entries where employee_id = $1`,
			[employeeId, onBreak.body.since]
		);
		expect(rows).toEqual([{ end_reason: 'leave', at_break: true }]);
	});

	it('refuses to clock in twice', async () => {
		const { browser } = await worker();
		await browser.post('/clock/in');

		const again = await browser.post('/clock/in');
		expect(again.status).toBe(409);
		expect(again.body).toMatchObject({ code: 'INVALID_STATE', message: 'Already clocked in' });
	});

	it('refuses break, out and resume that do not fit the state', async () => {
		const { browser } = await worker();

		for (const path of ['/clock/break', '/clock/out', '/clock/resume']) {
			const answer = await browser.post(path);
			expect(answer.status).toBe(409);
			expect(answer.body.code).toBe('INVALID_STATE');
		}

		await browser.post('/clock/in');
		expect((await browser.post('/clock/resume')).status).toBe(409);
	});

	it('answers two clock-ins at once with one entry and a conflict, not a server error', async () => {
		const { browser, employeeId } = await worker();

		const answers = await Promise.all([browser.post('/clock/in'), browser.post('/clock/in')]);
		expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);

		const { rows } = await api.superuser.query(
			'select count(*)::int as running from app.time_entries where employee_id = $1 and ended_at is null',
			[employeeId]
		);
		expect(rows[0].running).toBe(1);
	});

	it('turns away an account without a personnel record', async () => {
		const { browser } = await signedIn(api, await createUser(tenant, { role: 'admin' }));

		const answer = await browser.get('/clock');
		expect(answer.status).toBe(403);
		expect(answer.body).toMatchObject({ code: 'FORBIDDEN' });
		expect((await browser.post('/clock/in')).status).toBe(403);
	});

	it('wants a session and a json body', async () => {
		expect((await api.browser().get('/clock')).status).toBe(401);

		const { browser } = await worker();
		const extra = await browser.post('/clock/in', { startedAt: '2026-09-24T06:00:00+02:00' });
		expect(extra.status).toBe(400);
		expect(extra.body.code).toBe('VALIDATION');
	});
});
