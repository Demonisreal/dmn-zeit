import {
	bookableProjectSchema,
	clientSchema,
	projectSchema,
	rateSchema,
	taskSchema
} from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectContract, startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { createPerson, createTenant, type Person } from '../helpers/pg';

let api: Api;
let tenant: string;
let hr: Desk;
let admin: Desk;
let worker: Person;

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	hr = await signedIn(api, (await createPerson(tenant, { role: 'hr' })).userId);
	admin = await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId, {
		reauth: true
	});
	worker = await createPerson(tenant);
});

afterAll(() => api.app.close());

async function newClient(name = 'Bäckerei Korn') {
	const answer = await hr.post('/clients', { name, roundingIncrementMin: 15, roundingMode: 'up' });
	expect(answer.status).toBe(201);
	return answer.body;
}

describe('clients', () => {
	it('creates, changes and archives a client', async () => {
		const client = await newClient();
		expectContract(clientSchema, client);
		expect(client).toMatchObject({ countryCode: 'DE', isBusiness: true, invoiceLocale: 'de' });

		const changed = await hr.patch(`/clients/${client.id}`, { city: 'Köln' });
		expect(changed.body).toMatchObject({ city: 'Köln', roundingIncrementMin: 15 });

		const archived = await hr.post(`/clients/${client.id}/archive`);
		expect(archived.status).toBe(200);
		expect(archived.body.archivedAt).toEqual(expect.any(String));
		expect((await hr.get('/clients')).body.map((c: { id: string }) => c.id)).not.toContain(
			client.id
		);
		expect(
			(await hr.get('/clients?includeArchived=true')).body.map((c: { id: string }) => c.id)
		).toContain(client.id);
	});

	it('deletes a client without projects and locks one with projects away', async () => {
		const empty = await newClient('Leer GmbH');
		expect((await admin.delete(`/clients/${empty.id}`)).status).toBe(204);
		expect((await hr.get(`/clients/${empty.id}`)).status).toBe(404);

		const busy = await newClient('Voll GmbH');
		await hr.post('/projects', { clientId: busy.id, name: 'Website' });
		expect((await admin.delete(`/clients/${busy.id}`)).status).toBe(204);
		const kept = await hr.get(`/clients/${busy.id}`);
		expect(kept.body).toMatchObject({
			archivedAt: expect.any(String),
			restrictedAt: expect.any(String)
		});
	});

	it('takes the projects of a locked client out of booking', async () => {
		const client = await newClient('Gesperrt GmbH');
		const project = (await hr.post('/projects', { clientId: client.id, name: 'Altlast' })).body;
		const desk = await signedIn(api, (await createPerson(tenant)).userId);
		const before = await desk.get('/projects/bookable');
		expect(before.body.map((p: { id: string }) => p.id)).toContain(project.id);

		expect((await admin.delete(`/clients/${client.id}`)).status).toBe(204);
		const after = await desk.get('/projects/bookable');
		expect(after.body.map((p: { id: string }) => p.id)).not.toContain(project.id);
		expect(JSON.stringify(after.body)).not.toContain('Gesperrt GmbH');
		expect((await desk.post('/project-timer/start', { projectId: project.id })).status).toBe(403);
		expect((await hr.get(`/projects/${project.id}`)).body.archivedAt).toEqual(expect.any(String));
	});

	it('checks the vat id against the stored country when a patch brings only one of the two', async () => {
		const client = await newClient('Voisin SARL');
		const french = await hr.patch(`/clients/${client.id}`, {
			countryCode: 'FR',
			vatId: 'FR12345678901'
		});
		expect(french.status).toBe(200);

		for (const half of [{ countryCode: 'DE' }, { vatId: 'NL853746291B01' }]) {
			const refused = await hr.patch(`/clients/${client.id}`, half);
			expect(refused.status).toBe(400);
			expect(refused.body).toMatchObject({
				code: 'VALIDATION',
				details: [{ field: 'vatId', message: 'format.vatId' }]
			});
		}
		expect((await hr.get(`/clients/${client.id}`)).body).toMatchObject({
			countryCode: 'FR',
			vatId: 'FR12345678901'
		});

		expect((await hr.patch(`/clients/${client.id}`, { vatId: 'FR98765432109' })).status).toBe(200);
		expect((await hr.patch(`/clients/${client.id}`, { vatId: null })).status).toBe(200);
		expect((await hr.patch(`/clients/${client.id}`, { countryCode: 'CH' })).status).toBe(200);
		expect((await hr.patch(`/clients/${client.id}`, { vatId: 'CHE123456789' })).status).toBe(200);
	});

	it('checks the check digits of a leitweg-id on a patch as well', async () => {
		const client = await newClient('Stadt Lindental');
		const wrong = await hr.patch(`/clients/${client.id}`, { buyerReference: '04011000-12345-34' });
		expect(wrong.status).toBe(400);
		expect(wrong.body.details).toEqual([
			expect.objectContaining({ field: 'buyerReference', message: 'format.leitwegId' })
		]);
		expect((await hr.get(`/clients/${client.id}`)).body.buyerReference).toBeNull();

		const right = await hr.patch(`/clients/${client.id}`, { buyerReference: '04011000-12345-03' });
		expect(right.status).toBe(200);
		expect(right.body.buyerReference).toBe('04011000-12345-03');
		expect(
			(await hr.patch(`/clients/${client.id}`, { buyerReference: 'PO-2026-118' })).status
		).toBe(200);
	});

	it('wants a fresh confirmation before an admin deletes and keeps the client', async () => {
		const client = await newClient('Bestätigt GmbH');
		const unconfirmed = await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId);
		const answer = await unconfirmed.delete(`/clients/${client.id}`);
		expect(answer.status).toBe(403);
		expect(answer.body.code).toBe('REAUTH_REQUIRED');
		const kept = await hr.get(`/clients/${client.id}`);
		expect(kept.status).toBe(200);
		expect(kept.body).toMatchObject({ archivedAt: null, restrictedAt: null });
	});
});

describe('projects', () => {
	it('carries its budget, rounded the way the client bills', async () => {
		const client = await newClient();
		const created = await hr.post('/projects', {
			clientId: client.id,
			name: 'Website',
			budgetMinutes: 60
		});
		expect(created.status).toBe(201);
		expectContract(projectSchema, created.body);
		expect(created.body.budget).toMatchObject({ minutes: 60, usedMinutes: 0, state: 'ok' });

		// 47 minutes, a quarter hour rounded up from the client makes 60 of 60
		const desk = await signedIn(api, worker.userId);
		await desk.post('/project-entries', {
			projectId: created.body.id,
			startedAt: '2026-09-22T09:00:00+02:00',
			endedAt: '2026-09-22T09:47:00+02:00',
			note: 'Startseite'
		});
		const read = await hr.get(`/projects/${created.body.id}`);
		expect(read.body.budget).toMatchObject({ usedMinutes: 60, state: 'warn' });

		const budgets = await hr.get('/projects/budgets');
		expect(budgets.body.map((p: { id: string }) => p.id)).toContain(created.body.id);
	});

	it('adds tasks and offers only open projects for booking', async () => {
		const client = await newClient();
		const open = (await hr.post('/projects', { clientId: client.id, name: 'Kasse' })).body;
		const closed = (
			await hr.post('/projects', { clientId: client.id, name: 'Intern', openToAll: false })
		).body;

		const task = await hr.post(`/projects/${open.id}/tasks`, { name: 'Beratung' });
		expect(task.status).toBe(201);
		expectContract(taskSchema, task.body);
		const renamed = await hr.patch(`/tasks/${task.body.id}`, { name: 'Beratung vor Ort' });
		expect(renamed.body.name).toBe('Beratung vor Ort');

		const desk = await signedIn(api, worker.userId);
		const before = await desk.get('/projects/bookable');
		expect(before.status).toBe(200);
		for (const project of before.body) expectContract(bookableProjectSchema, project);
		const ids = before.body.map((p: { id: string }) => p.id);
		expect(ids).toContain(open.id);
		expect(ids).not.toContain(closed.id);
		expect(before.body.find((p: { id: string }) => p.id === open.id).tasks).toEqual([
			{ id: task.body.id, name: 'Beratung vor Ort', billable: null }
		]);

		const members = await hr.put(`/projects/${closed.id}/members`, {
			employeeIds: [worker.employeeId]
		});
		expect(members.body).toEqual({ employeeIds: [worker.employeeId] });
		const after = await desk.get('/projects/bookable');
		expect(after.body.map((p: { id: string }) => p.id)).toContain(closed.id);

		await hr.post(`/tasks/${task.body.id}/archive`);
		const archived = (await desk.get('/projects/bookable')).body.find(
			(p: { id: string }) => p.id === open.id
		);
		expect(archived.tasks).toEqual([]);
	});

	it('lists every task of a project to hr, archived ones included', async () => {
		const client = await newClient();
		const project = (await hr.post('/projects', { clientId: client.id, name: 'Umzug' })).body;
		const packing = (await hr.post(`/projects/${project.id}/tasks`, { name: 'Packen' })).body;
		const driving = (await hr.post(`/projects/${project.id}/tasks`, { name: 'Fahren' })).body;
		await hr.post(`/tasks/${packing.id}/archive`);

		const listed = await hr.get(`/projects/${project.id}/tasks`);
		expect(listed.status).toBe(200);
		for (const task of listed.body) expectContract(taskSchema, task);
		expect(
			listed.body.map((t: { id: string; archivedAt: string | null }) => [t.id, t.archivedAt])
		).toEqual([
			[driving.id, null],
			[packing.id, expect.any(String)]
		]);

		const desk = await signedIn(api, worker.userId);
		expect((await desk.get(`/projects/${project.id}/tasks`)).status).toBe(403);
		const stranger = await signedIn(
			api,
			(await createPerson(await createTenant(), { role: 'hr' })).userId
		);
		expect((await stranger.get(`/projects/${project.id}/tasks`)).status).toBe(404);
	});

	it('names the members of a project for hr', async () => {
		const client = await newClient();
		const project = (
			await hr.post('/projects', { clientId: client.id, name: 'Inventur', openToAll: false })
		).body;
		expect((await hr.get(`/projects/${project.id}/members`)).body).toEqual([]);

		await hr.put(`/projects/${project.id}/members`, { employeeIds: [worker.employeeId] });
		const listed = await hr.get(`/projects/${project.id}/members`);
		expect(listed.status).toBe(200);
		expect(listed.body).toEqual([{ employeeId: worker.employeeId, name: 'Erika Muster' }]);

		const desk = await signedIn(api, worker.userId);
		expect((await desk.get(`/projects/${project.id}/members`)).status).toBe(403);
		const stranger = await signedIn(
			api,
			(await createPerson(await createTenant(), { role: 'hr' })).userId
		);
		expect((await stranger.get(`/projects/${project.id}/members`)).status).toBe(404);
	});
});

describe('rates', () => {
	it('removes a rate only before it takes effect', async () => {
		const client = await newClient();
		const current = await hr.post('/rates', {
			clientId: client.id,
			validFrom: '2026-01-01',
			rateCents: '9500'
		});
		expect(current.status).toBe(201);
		expectContract(rateSchema, current.body);
		const future = await hr.post('/rates', {
			clientId: client.id,
			validFrom: '2099-01-01',
			rateCents: '9900'
		});

		const listed = await hr.get(`/rates?client=${client.id}`);
		expect(listed.body.map((r: { rateCents: string }) => r.rateCents)).toEqual(['9900', '9500']);

		const refused = await hr.delete(`/rates/${current.body.id}`);
		expect(refused.status).toBe(409);
		expect(refused.body).toEqual({
			code: 'INVALID_STATE',
			message: 'Only a rate that has not taken effect yet can be removed',
			details: { field: 'validFrom', message: 'rate.futureOnly' }
		});
		expect((await hr.delete(`/rates/${future.body.id}`)).status).toBe(204);
	});
});

describe('another tenant', () => {
	it('reaches nothing of this one through an id', async () => {
		const client = await newClient('Nachbar GmbH');
		const project = (await hr.post('/projects', { clientId: client.id, name: 'Nachbar' })).body;
		const task = (await hr.post(`/projects/${project.id}/tasks`, { name: 'Planung' })).body;
		const rate = (
			await hr.post('/rates', { clientId: client.id, validFrom: '2099-01-01', rateCents: '9900' })
		).body;
		const own = await signedIn(api, worker.userId);
		const entry = (
			await own.post('/project-entries', {
				projectId: project.id,
				startedAt: '2026-09-23T13:00:00+02:00',
				endedAt: '2026-09-23T14:00:00+02:00',
				note: 'Abstimmung'
			})
		).body;

		const other = await createTenant();
		const stranger = await signedIn(api, (await createPerson(other, { role: 'admin' })).userId, {
			reauth: true
		});
		const routes: [string, () => Promise<{ status: number }>][] = [
			['GET client', () => stranger.get(`/clients/${client.id}`)],
			['PATCH client', () => stranger.patch(`/clients/${client.id}`, { city: 'Bonn' })],
			['archive client', () => stranger.post(`/clients/${client.id}/archive`)],
			['DELETE client', () => stranger.delete(`/clients/${client.id}`)],
			['GET project', () => stranger.get(`/projects/${project.id}`)],
			['PATCH project', () => stranger.patch(`/projects/${project.id}`, { name: 'Meins' })],
			['archive project', () => stranger.post(`/projects/${project.id}/archive`)],
			['PUT members', () => stranger.put(`/projects/${project.id}/members`, { employeeIds: [] })],
			['POST task', () => stranger.post(`/projects/${project.id}/tasks`, { name: 'Neu' })],
			['PATCH task', () => stranger.patch(`/tasks/${task.id}`, { name: 'Meins' })],
			['archive task', () => stranger.post(`/tasks/${task.id}/archive`)],
			['DELETE rate', () => stranger.delete(`/rates/${rate.id}`)],
			['PATCH entry', () => stranger.patch(`/project-entries/${entry.id}`, { note: 'Meins' })],
			['void entry', () => stranger.post(`/project-entries/${entry.id}/void`)],
			[
				'book for',
				() =>
					stranger.post('/project-entries', {
						projectId: project.id,
						startedAt: '2026-09-24T09:00:00+02:00',
						endedAt: '2026-09-24T10:00:00+02:00',
						note: 'Fremd',
						employeeId: worker.employeeId,
						reason: 'Nachtrag laut Stundenzettel'
					})
			],
			[
				'project week',
				() => stranger.get(`/employees/${worker.employeeId}/project-week?from=2026-09-21`)
			]
		];
		for (const [route, send] of routes) {
			expect({ route, status: (await send()).status }).toEqual({ route, status: 404 });
		}

		// ids in the body run into the composite foreign keys or the booking guard
		expect((await stranger.post('/projects', { clientId: client.id, name: 'X' })).status).toBe(409);
		const rateThere = { clientId: client.id, validFrom: '2099-01-01', rateCents: '1' };
		expect((await stranger.post('/rates', rateThere)).status).toBe(409);
		const colleague = await signedIn(api, (await createPerson(other)).userId);
		const timer = await colleague.post('/project-timer/start', { projectId: project.id });
		expect(timer.status).toBe(403);
		const entries = await stranger.get(
			`/employees/${worker.employeeId}/project-entries?from=2026-09-21&to=2026-09-27`
		);
		expect(entries.body.items).toEqual([]);

		expect((await hr.get(`/clients/${client.id}`)).body).toMatchObject({
			city: null,
			archivedAt: null
		});
		expect((await hr.get(`/projects/${project.id}`)).body).toMatchObject({
			name: 'Nachbar',
			archivedAt: null
		});
		expect((await hr.get(`/projects/${project.id}/tasks`)).body).toEqual([
			expect.objectContaining({ name: 'Planung', archivedAt: null })
		]);
		expect((await hr.get(`/rates?client=${client.id}`)).body).toHaveLength(1);
		const mine = await own.get(
			`/employees/${worker.employeeId}/project-entries?from=2026-09-23&to=2026-09-23`
		);
		expect(mine.body.items).toEqual([
			expect.objectContaining({ id: entry.id, note: 'Abstimmung', voidedAt: null })
		]);
	});
});
