import { timeEntryPageSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api, type Browser } from '../auth/api';
import {
	createPerson,
	createTeam,
	createTenant,
	createUser,
	type Account,
	type Person
} from '../helpers/pg';
import { addEntry, signedIn } from './people';

let api: Api;
let tenant: string;
let worker: Person & { browser: Browser };
let lead: Person & { browser: Browser };
let hr: Account & { browser: Browser };
let outsider: Person;
let entries: string[];

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

	entries = [
		await addEntry(api, worker, '2026-09-21T08:00:00+02:00', '2026-09-21T12:00:00+02:00'),
		await addEntry(api, worker, '2026-09-21T12:30:00+02:00', '2026-09-21T16:30:00+02:00'),
		await addEntry(api, worker, '2026-09-22T08:00:00+02:00', '2026-09-22T16:00:00+02:00')
	];
	const voided = await addEntry(
		api,
		worker,
		'2026-09-23T08:00:00+02:00',
		'2026-09-23T16:00:00+02:00'
	);
	const { rows } = await api.superuser.query<{ id: string }>(
		`insert into app.correction_requests
		   (tenant_id, employee_id, action, target_entry_id, reason, status, requested_by, decided_by, decided_at)
		 values ($1, $2, 'void', $3, 'Doppelt gestempelt, bitte streichen', 'approved', $4, $4, now())
		 returning id`,
		[tenant, worker.employeeId, voided, hr.userId]
	);
	await api.superuser.query(
		'update app.time_entries set voided_at = now(), voided_by_request_id = $2 where id = $1',
		[voided, rows[0]!.id]
	);
	await addEntry(api, outsider, '2026-09-21T08:00:00+02:00', '2026-09-21T12:00:00+02:00');
});

afterAll(() => api.app.close());

const path = (employeeId: string, query = 'from=2026-09-01&to=2026-09-30') =>
	`/employees/${employeeId}/entries?${query}`;

describe('GET /api/employees/:id/entries', () => {
	it('lists the own entries in order, leaving out voided ones', async () => {
		const answer = await worker.browser.get(path(worker.employeeId));

		expect(answer.status).toBe(200);
		const page = timeEntryPageSchema.parse(answer.body);
		expect(page.items.map((entry) => entry.id)).toEqual(entries);
		expect(page.items[0]).toMatchObject({
			employeeId: worker.employeeId,
			workday: '2026-09-21',
			startedAt: '2026-09-21T06:00:00Z',
			endedAt: '2026-09-21T10:00:00Z',
			source: 'seed',
			voidedAt: null
		});
		expect(page.nextCursor).toBeNull();
	});

	it('pages with a cursor until nothing is left', async () => {
		const first = await worker.browser.get(
			path(worker.employeeId, 'from=2026-09-01&to=2026-09-30&limit=2')
		);
		expect(first.body.items).toHaveLength(2);
		expect(first.body.nextCursor).toEqual(expect.any(String));

		const second = await worker.browser.get(
			path(
				worker.employeeId,
				`from=2026-09-01&to=2026-09-30&limit=2&cursor=${first.body.nextCursor}`
			)
		);
		expect(second.body.items.map((entry: { id: string }) => entry.id)).toEqual([entries[2]]);
		expect(second.body.nextCursor).toBeNull();
	});

	it('refuses a cursor it did not hand out', async () => {
		const answer = await worker.browser.get(
			path(worker.employeeId, 'from=2026-09-01&to=2026-09-30&cursor=bm9wZQ')
		);
		expect(answer.status).toBe(400);
		expect(answer.body).toMatchObject({ code: 'VALIDATION', details: [{ field: 'cursor' }] });
	});

	it('shows the team to its lead and everyone to hr', async () => {
		expect((await lead.browser.get(path(worker.employeeId))).body.items).toHaveLength(3);
		expect((await hr.browser.get(path(worker.employeeId))).body.items).toHaveLength(3);
		expect((await hr.browser.get(path(outsider.employeeId))).body.items).toHaveLength(1);
	});

	it('keeps other people out of reach', async () => {
		const peek = await worker.browser.get(path(outsider.employeeId));
		expect(peek.status).toBe(403);
		expect(peek.body.code).toBe('FORBIDDEN');
		expect((await worker.browser.get(path(lead.employeeId))).status).toBe(403);
		expect((await lead.browser.get(path(outsider.employeeId))).status).toBe(403);
	});

	it('validates the range and the id', async () => {
		const tooLong = await worker.browser.get(
			path(worker.employeeId, 'from=2026-01-01&to=2026-06-30')
		);
		expect(tooLong.status).toBe(400);
		expect(tooLong.body.details[0]).toMatchObject({ field: 'to', message: 'range.tooLong' });

		expect((await worker.browser.get(path(worker.employeeId, 'from=2026-09-01'))).status).toBe(400);
		expect((await worker.browser.get(path('nicht-da'))).status).toBe(400);
	});
});
