import { findingSchema, ruleSetSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { startApi, type Api, type Browser } from '../auth/api';
import {
	createContract,
	createPerson,
	createTeam,
	createTenant,
	createUser,
	type Account,
	type Person
} from '../helpers/pg';
import { addEntry, signedIn } from '../time/people';

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

	// nine hours in one go until 23:00, back at 07:00: eight hours of rest across midnight
	await addEntry(api, worker, '2026-09-21T14:00:00+02:00', '2026-09-21T23:00:00+02:00');
	await addEntry(api, worker, '2026-09-22T07:00:00+02:00', '2026-09-22T11:00:00+02:00');
	await addEntry(api, lead, '2026-09-20T09:00:00+02:00', '2026-09-20T12:00:00+02:00');
	await addEntry(api, outsider, '2026-09-20T09:00:00+02:00', '2026-09-20T12:00:00+02:00');
});

afterAll(() => api.app.close());

const findings = (browser: Browser, query: string) => browser.get(`/compliance/findings?${query}`);
const summary = (list: { employee: { id: string }; date: string; code: string }[]) =>
	list.map((finding) => [finding.employee.id, finding.date, finding.code]);

const breakShort = {
	date: '2026-09-21',
	code: 'ARBZG_4_BREAK_SHORT',
	ruleVersion: 'arbzg-1994',
	note: 'Inventur, mit dem Team abgesprochen'
};

describe('GET /api/compliance/findings', () => {
	it('works the findings of the team out of its entries, the rest across midnight included', async () => {
		const answer = await findings(lead.browser, 'from=2026-09-20&to=2026-09-22');

		expect(answer.status).toBe(200);
		const list = z.array(findingSchema).parse(answer.body);
		expect(summary(list)).toEqual([
			[lead.employeeId, '2026-09-20', 'ARBZG_9_SUNDAY'],
			[worker.employeeId, '2026-09-21', 'ARBZG_3_OVER_8'],
			[worker.employeeId, '2026-09-21', 'ARBZG_4_BREAK_SHORT'],
			[worker.employeeId, '2026-09-21', 'ARBZG_4_CONTINUOUS_6H'],
			[worker.employeeId, '2026-09-22', 'ARBZG_5_REST_UNDER_11H']
		]);
		expect(list.at(-1)).toMatchObject({
			employee: { name: 'Erika Muster' },
			severity: 'warning',
			ruleVersion: 'arbzg-1994',
			facts: { restMinutes: 480 },
			explanation: { key: 'finding.arbzg_5_rest_under_11h' },
			ack: null
		});
	});

	it('gives hr the whole tenant and a single person on request', async () => {
		const all = await findings(hr.browser, 'from=2026-09-20&to=2026-09-20');
		expect(
			summary(all.body)
				.map(([id]) => id)
				.sort()
		).toEqual([lead.employeeId, outsider.employeeId].sort());

		const one = await findings(
			hr.browser,
			`from=2026-09-22&to=2026-09-22&employee=${worker.employeeId}`
		);
		expect(summary(one.body)).toEqual([
			[worker.employeeId, '2026-09-22', 'ARBZG_5_REST_UNDER_11H']
		]);
	});

	it('is for leads and hr, and a lead only reaches the team', async () => {
		const employee = await findings(worker.browser, 'from=2026-09-20&to=2026-09-22');
		expect(employee.status).toBe(403);
		expect(employee.body.code).toBe('FORBIDDEN');

		const stranger = await findings(
			lead.browser,
			`from=2026-09-20&to=2026-09-22&employee=${outsider.employeeId}`
		);
		expect(stranger.status).toBe(403);
	});

	it('validates the range', async () => {
		expect((await findings(lead.browser, 'from=2026-09-22&to=2026-09-20')).status).toBe(400);
		expect((await findings(lead.browser, 'from=2025-01-01&to=2026-09-20')).status).toBe(400);
	});
});

describe('POST /api/compliance/findings/ack', () => {
	it('acknowledges a finding once, which then shows as acknowledged', async () => {
		const answer = await lead.browser.post('/compliance/findings/ack', {
			employeeId: worker.employeeId,
			...breakShort
		});
		expect(answer.status).toBe(201);
		expect(findingSchema.parse(answer.body)).toMatchObject({
			code: 'ARBZG_4_BREAK_SHORT',
			ack: { by: { id: lead.userId }, note: breakShort.note }
		});

		const twice = await lead.browser.post('/compliance/findings/ack', {
			employeeId: worker.employeeId,
			...breakShort
		});
		expect(twice.status).toBe(409);
		expect(twice.body.code).toBe('ALREADY_EXISTS');

		const acknowledged = await findings(
			lead.browser,
			'from=2026-09-21&to=2026-09-22&state=acknowledged'
		);
		expect(summary(acknowledged.body)).toEqual([
			[worker.employeeId, '2026-09-21', 'ARBZG_4_BREAK_SHORT']
		]);
		const open = await findings(lead.browser, 'from=2026-09-21&to=2026-09-22&state=open');
		expect(open.body).toHaveLength(3);
	});

	it('knows only findings that exist', async () => {
		const answer = await lead.browser.post('/compliance/findings/ack', {
			employeeId: worker.employeeId,
			...breakShort,
			date: '2026-09-23'
		});
		expect(answer.status).toBe(404);
	});

	it('leaves the own findings and those of strangers alone', async () => {
		const own = await lead.browser.post('/compliance/findings/ack', {
			employeeId: lead.employeeId,
			...breakShort,
			date: '2026-09-20',
			code: 'ARBZG_9_SUNDAY'
		});
		expect(own.status).toBe(403);

		const stranger = await lead.browser.post('/compliance/findings/ack', {
			employeeId: outsider.employeeId,
			...breakShort,
			date: '2026-09-20',
			code: 'ARBZG_9_SUNDAY'
		});
		expect(stranger.status).toBe(403);

		expect(
			(
				await worker.browser.post('/compliance/findings/ack', {
					employeeId: worker.employeeId,
					...breakShort
				})
			).status
		).toBe(403);
	});
});

describe('GET /api/compliance/rule-versions', () => {
	it('lists the rule sets for everyone', async () => {
		const answer = await worker.browser.get('/compliance/rule-versions');
		expect(answer.status).toBe(200);
		expect(z.array(ruleSetSchema).parse(answer.body)).toEqual([
			{
				version: 'arbzg-1994',
				validFrom: '1994-07-01',
				limits: {
					regularDailyMinutes: 480,
					maxDailyMinutes: 600,
					breakOver6hMinutes: 30,
					breakOver9hMinutes: 45,
					minBreakMinutes: 15,
					maxContinuousMinutes: 360,
					minRestMinutes: 660
				}
			}
		]);
	});
});
