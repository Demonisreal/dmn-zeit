import { correctionPageSchema, correctionSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api, type Browser } from '../auth/api';
import { createPerson, createTeam, createTenant, type Person } from '../helpers/pg';
import { addEntry, closeMonth, signedIn } from '../time/people';

type Member = Person & { browser: Browser };

let api: Api;
let tenant: string;
let worker: Member;
let colleague: Member;
let lead: Member;
let otherLead: Member;
let hr: Member;
let januaryEntry: string;

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	const team = await createTeam(tenant);
	const otherTeam = await createTeam(tenant, 'Lohn');
	worker = await signedIn(api, await createPerson(tenant, { teamId: team }));
	colleague = await signedIn(api, await createPerson(tenant, { teamId: team }));
	lead = await signedIn(
		api,
		await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team })
	);
	otherLead = await signedIn(
		api,
		await createPerson(tenant, { role: 'team_lead', teamId: otherTeam, leads: otherTeam })
	);
	hr = await signedIn(api, await createPerson(tenant, { role: 'hr' }));

	januaryEntry = await addEntry(
		api,
		worker,
		'2026-01-12T08:00:00+01:00',
		'2026-01-12T16:00:00+01:00'
	);
	await closeMonth(api, tenant, '2026-01-01', hr.userId);
});

afterAll(() => api.app.close());

const reason = 'Gehen vergessen, war bis 16 Uhr da';
let nextDay = 0;
// every test works on a day of its own in september, far from the closed january
function day() {
	const date = `2026-09-${String(++nextDay).padStart(2, '0')}`;
	return (time: string) => `${date}T${time}:00+02:00`;
}

async function entriesOf(employeeId: string) {
	const { rows } = await api.superuser.query(
		`select id, started_at, ended_at, source, request_id, voided_by_request_id
		   from app.time_entries where employee_id = $1 order by started_at, created_at`,
		[employeeId]
	);
	return rows;
}

describe('POST /api/corrections for the own times', () => {
	it('files a request that waits for someone else and leaves the entry alone', async () => {
		const at = day();
		const entry = await addEntry(api, worker, at('08:00'), at('12:00'));

		const answer = await worker.browser.post('/corrections', {
			action: 'change',
			entryId: entry,
			startedAt: at('08:00'),
			endedAt: at('16:00'),
			reason
		});

		expect(answer.status).toBe(201);
		expect(correctionSchema.parse(answer.body)).toMatchObject({
			employee: { id: worker.employeeId, name: 'Erika Muster' },
			action: 'change',
			target: { entryId: entry },
			status: 'pending',
			requestedBy: { id: worker.userId },
			decidedBy: null
		});
		const [stored] = (await entriesOf(worker.employeeId)).filter((row) => row.id === entry);
		expect(stored.voided_by_request_id).toBeNull();
	});

	it('is applied once the lead approves: old entry voided, new one tied to the request', async () => {
		const at = day();
		const entry = await addEntry(api, worker, at('08:00'), at('12:00'));
		const request = await worker.browser.post('/corrections', {
			action: 'change',
			entryId: entry,
			startedAt: at('08:00'),
			endedAt: at('16:00'),
			reason
		});

		const approved = await lead.browser.post(`/corrections/${request.body.id}/approve`, {
			note: 'Passt'
		});
		expect(approved.status).toBe(200);
		expect(approved.body).toMatchObject({
			status: 'approved',
			decidedBy: { id: lead.userId },
			decisionNote: 'Passt'
		});

		const rows = (await entriesOf(worker.employeeId)).filter(
			(row) => row.id === entry || row.request_id === request.body.id
		);
		expect(rows).toEqual([
			expect.objectContaining({ id: entry, voided_by_request_id: request.body.id }),
			expect.objectContaining({ source: 'correction', request_id: request.body.id })
		]);

		const week = await worker.browser.get(
			`/employees/${worker.employeeId}/days?from=${at('00:00').slice(0, 10)}&to=${at('00:00').slice(0, 10)}`
		);
		expect(week.body.days[0]).toMatchObject({
			workedMinutes: 480,
			entries: [{ source: 'correction' }]
		});
	});

	it('lets nobody decide on their own request, not even a lead or hr', async () => {
		const at = day();
		const leadRequest = await lead.browser.post('/corrections', {
			action: 'add',
			employeeId: lead.employeeId,
			startedAt: at('08:00'),
			endedAt: at('12:00'),
			reason
		});
		expect(leadRequest.body.status).toBe('pending');

		const own = await lead.browser.post(`/corrections/${leadRequest.body.id}/approve`, {});
		expect(own.status).toBe(403);
		expect(own.body).toMatchObject({ code: 'FORBIDDEN' });

		const hrRequest = await hr.browser.post('/corrections', {
			action: 'add',
			employeeId: hr.employeeId,
			startedAt: at('08:00'),
			endedAt: at('12:00'),
			reason
		});
		expect(hrRequest.status).toBe(201);
		expect(hrRequest.body.status).toBe('pending');
		expect((await hr.browser.post(`/corrections/${hrRequest.body.id}/approve`, {})).status).toBe(
			403
		);
		expect(await entriesOf(hr.employeeId)).toEqual([]);

		expect((await hr.browser.post(`/corrections/${leadRequest.body.id}/approve`, {})).status).toBe(
			200
		);
	});

	it('refuses a request on a closed month', async () => {
		const change = await worker.browser.post('/corrections', {
			action: 'void',
			entryId: januaryEntry,
			reason
		});
		expect(change.status).toBe(409);
		expect(change.body.code).toBe('PERIOD_LOCKED');

		const add = await worker.browser.post('/corrections', {
			action: 'add',
			employeeId: worker.employeeId,
			startedAt: '2026-01-13T08:00:00+01:00',
			endedAt: '2026-01-13T12:00:00+01:00',
			reason
		});
		expect(add.status).toBe(409);
		expect(add.body.code).toBe('PERIOD_LOCKED');
	});
});

describe('POST /api/corrections for someone else', () => {
	it('is applied right away when hr corrects, and the person sees it at once', async () => {
		const at = day();
		const answer = await hr.browser.post('/corrections', {
			action: 'add',
			employeeId: worker.employeeId,
			startedAt: at('08:00'),
			endedAt: at('16:30'),
			reason
		});

		expect(answer.status).toBe(201);
		expect(answer.body).toMatchObject({
			status: 'approved',
			requestedBy: { id: hr.userId },
			decidedBy: { id: hr.userId }
		});
		const date = at('00:00').slice(0, 10);
		const seen = await worker.browser.get(
			`/employees/${worker.employeeId}/entries?from=${date}&to=${date}`
		);
		expect(seen.body.items).toEqual([
			expect.objectContaining({ source: 'correction', requestId: answer.body.id })
		]);
	});

	it('voids an entry directly and takes the whole step back when the month is closed', async () => {
		const at = day();
		const entry = await addEntry(api, colleague, at('08:00'), at('12:00'));
		const voided = await hr.browser.post('/corrections', {
			action: 'void',
			entryId: entry,
			reason
		});
		expect(voided.status).toBe(201);
		expect(
			(await entriesOf(colleague.employeeId)).find((row) => row.id === entry).voided_by_request_id
		).toBe(voided.body.id);

		const locked = await hr.browser.post('/corrections', {
			action: 'void',
			entryId: januaryEntry,
			reason
		});
		expect(locked.status).toBe(409);
		expect(locked.body.code).toBe('PERIOD_LOCKED');
		const { rows } = await api.superuser.query(
			'select count(*)::int as requests from app.correction_requests where target_entry_id = $1',
			[januaryEntry]
		);
		expect(rows[0].requests).toBe(0);
	});

	it('reports an overlap with an existing entry as a conflict', async () => {
		const at = day();
		await addEntry(api, colleague, at('08:00'), at('12:00'));
		const answer = await hr.browser.post('/corrections', {
			action: 'add',
			employeeId: colleague.employeeId,
			startedAt: at('11:00'),
			endedAt: at('13:00'),
			reason
		});
		expect(answer.status).toBe(409);
		expect(answer.body.code).toBe('TIME_OVERLAP');
	});

	it('is only for hr: employees and leads cannot touch the times of others', async () => {
		const at = day();
		const entry = await addEntry(api, colleague, at('08:00'), at('12:00'));
		const add = {
			action: 'add',
			employeeId: colleague.employeeId,
			startedAt: at('13:00'),
			endedAt: at('14:00'),
			reason
		};

		expect((await worker.browser.post('/corrections', add)).status).toBe(403);
		expect((await lead.browser.post('/corrections', add)).status).toBe(403);
		// row security hides the entry of a colleague, so it is not even found
		expect(
			(await worker.browser.post('/corrections', { action: 'void', entryId: entry, reason })).status
		).toBe(404);
	});

	it('validates reason and span', async () => {
		const at = day();
		const short = await worker.browser.post('/corrections', {
			action: 'add',
			employeeId: worker.employeeId,
			startedAt: at('08:00'),
			endedAt: at('12:00'),
			reason: 'vergessen'
		});
		expect(short.status).toBe(400);
		expect(short.body.details[0]).toMatchObject({ field: 'reason', code: 'too_small' });

		const backwards = await worker.browser.post('/corrections', {
			action: 'add',
			employeeId: worker.employeeId,
			startedAt: at('12:00'),
			endedAt: at('08:00'),
			reason
		});
		expect(backwards.status).toBe(400);
		expect(backwards.body.details[0]).toMatchObject({ message: 'correction.endBeforeStart' });
	});
});

describe('deciding and withdrawing', () => {
	async function pending() {
		const at = day();
		const answer = await worker.browser.post('/corrections', {
			action: 'add',
			employeeId: worker.employeeId,
			startedAt: at('08:00'),
			endedAt: at('12:00'),
			reason
		});
		return answer.body.id as string;
	}

	it('leaves the decision to leads of the team and to hr', async () => {
		const id = await pending();
		expect((await colleague.browser.post(`/corrections/${id}/approve`, {})).status).toBe(403);
		expect((await otherLead.browser.post(`/corrections/${id}/approve`, {})).status).toBe(404);
		expect((await hr.browser.post(`/corrections/${id}/approve`, {})).status).toBe(200);
	});

	it('rejects only with a note and changes no entry', async () => {
		const id = await pending();
		expect((await lead.browser.post(`/corrections/${id}/reject`, {})).status).toBe(400);

		const rejected = await lead.browser.post(`/corrections/${id}/reject`, {
			note: 'Laut Dienstplan frei'
		});
		expect(rejected.status).toBe(200);
		expect(rejected.body).toMatchObject({
			status: 'rejected',
			decisionNote: 'Laut Dienstplan frei'
		});
		expect((await entriesOf(worker.employeeId)).some((row) => row.request_id === id)).toBe(false);

		const again = await lead.browser.post(`/corrections/${id}/approve`, {});
		expect(again.status).toBe(409);
		expect(again.body.code).toBe('INVALID_STATE');
	});

	it('is withdrawn by the requester alone and only while pending', async () => {
		const id = await pending();
		expect((await lead.browser.post(`/corrections/${id}/withdraw`)).status).toBe(403);

		const withdrawn = await worker.browser.post(`/corrections/${id}/withdraw`);
		expect(withdrawn.status).toBe(200);
		expect(withdrawn.body.status).toBe('withdrawn');
		expect((await worker.browser.post(`/corrections/${id}/withdraw`)).status).toBe(409);
		expect((await lead.browser.post(`/corrections/${id}/approve`, {})).status).toBe(409);
	});
});

describe('GET /api/corrections', () => {
	const range = 'from=2026-01-01&to=2026-12-31';

	it('shows everyone their own corrections', async () => {
		const answer = await worker.browser.get(`/corrections?scope=mine&${range}`);
		expect(answer.status).toBe(200);
		const page = correctionPageSchema.parse(answer.body);
		expect(page.items.length).toBeGreaterThan(0);
		expect(page.items.every((correction) => correction.employee.id === worker.employeeId)).toBe(
			true
		);
	});

	it('fills the inbox of a lead with pending team requests, never their own', async () => {
		const answer = await lead.browser.get(`/corrections?scope=inbox&${range}`);
		const page = correctionPageSchema.parse(answer.body);
		expect(page.items.length).toBeGreaterThan(0);
		expect(
			page.items.every(
				(correction) =>
					correction.status === 'pending' &&
					correction.requestedBy.id !== lead.userId &&
					[worker.employeeId, colleague.employeeId].includes(correction.employee.id)
			)
		).toBe(true);

		const other = await otherLead.browser.get(`/corrections?scope=inbox&${range}`);
		expect(other.body.items).toEqual([]);
	});

	it('gives hr the whole tenant and pages through it', async () => {
		const first = await hr.browser.get(`/corrections?scope=all&${range}&limit=2`);
		expect(first.body.items).toHaveLength(2);
		const second = await hr.browser.get(
			`/corrections?scope=all&${range}&limit=2&cursor=${first.body.nextCursor}`
		);
		expect(second.status).toBe(200);
		const ids = [...first.body.items, ...second.body.items].map((c: { id: string }) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('keeps inbox and all from employees and foreign people from leads', async () => {
		expect((await worker.browser.get(`/corrections?scope=inbox&${range}`)).status).toBe(403);
		expect((await worker.browser.get(`/corrections?scope=all&${range}`)).status).toBe(403);
		expect(
			(await otherLead.browser.get(`/corrections?scope=all&${range}&employee=${worker.employeeId}`))
				.status
		).toBe(403);
	});
});
