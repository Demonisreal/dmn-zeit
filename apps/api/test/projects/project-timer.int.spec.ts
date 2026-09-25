import { projectTimerSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { Clock } from '../../src/common/clock';
import { expectContract, startApi, type Api } from '../auth/api';
import { signedIn } from '../helpers/desk';
import { createPerson, createTenant, createUser } from '../helpers/pg';
import { createClient, createProject } from './books';

let api: Api;
let tenant: string;
let website: string;
let bakery: string;
let closed: string;

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	const client = await createClient(api.superuser, tenant);
	website = await createProject(api.superuser, tenant, client, { budgetMinutes: 600 });
	bakery = await createProject(api.superuser, tenant, client, { name: 'Kasse' });
	closed = await createProject(api.superuser, tenant, client, {
		name: 'Jahresabschluss',
		openToAll: false
	});
});

afterAll(() => api.app.close());

async function worker(role: 'employee' | 'hr' = 'employee') {
	const person = await createPerson(tenant, { role });
	return { ...person, desk: await signedIn(api, person.userId) };
}

describe('project timer', () => {
	it('starts, reports and stops a timer on the clock of the database', async () => {
		const { desk, employeeId } = await worker();
		expect((await desk.get('/project-timer')).body).toEqual({ state: 'idle' });

		const started = await desk.post('/project-timer/start', { projectId: website });
		expect(started.status).toBe(200);
		expectContract(projectTimerSchema, started.body);
		expect(started.body).toMatchObject({
			state: 'running',
			projectId: website,
			taskId: null,
			hint: false,
			budget: { minutes: 600, usedMinutes: 0, state: 'ok' }
		});

		const stopped = await desk.post('/project-timer/stop', { note: 'Startseite' });
		expect(stopped.status).toBe(200);
		expect(stopped.body).toEqual({ state: 'idle' });

		const { rows } = await api.superuser.query(
			`select source, note, ended_at > started_at as ordered
			   from app.project_entries where employee_id = $1`,
			[employeeId]
		);
		expect(rows).toEqual([{ source: 'timer', note: 'Startseite', ordered: true }]);
	});

	it('ends the running timer in the same request that starts the next one', async () => {
		const { desk, employeeId } = await worker();
		await desk.post('/project-timer/start', { projectId: website });

		const switched = await desk.post('/project-timer/start', { projectId: bakery });
		expect(switched.status).toBe(200);
		expect(switched.body).toMatchObject({ state: 'running', projectId: bakery });

		const { rows } = await api.superuser.query(
			`select project_id, started_at::text, ended_at::text
			   from app.project_entries where employee_id = $1 order by started_at, ended_at nulls last`,
			[employeeId]
		);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ project_id: website });
		expect(rows[1]).toMatchObject({ project_id: bakery, ended_at: null });
		// [) ranges: the old one ends at the very microsecond the new one starts
		expect(rows[0].ended_at).toBe(rows[1].started_at);
	});

	it('keeps the old timer running when the switch is refused', async () => {
		const { desk } = await worker();
		const first = await desk.post('/project-timer/start', { projectId: website });
		expect((await desk.post('/project-timer/start', { projectId: closed })).status).toBe(403);
		expect((await desk.get('/project-timer')).body).toMatchObject({
			state: 'running',
			entryId: first.body.entryId
		});
	});

	it('leaves one running timer after two starts at the same time', async () => {
		const { desk, employeeId } = await worker();
		const answers = await Promise.all([
			desk.post('/project-timer/start', { projectId: website }),
			desk.post('/project-timer/start', { projectId: bakery })
		]);
		const statuses = answers.map((answer) => answer.status);
		expect(statuses).toContain(200);
		for (const status of statuses) expect([200, 400, 409]).toContain(status);

		const { rows } = await api.superuser.query(
			`select id from app.project_entries
			  where employee_id = $1 and ended_at is null and voided_at is null`,
			[employeeId]
		);
		expect(rows).toHaveLength(1);
		expect((await desk.get('/project-timer')).body.entryId).toBe(rows[0].id);
	});

	it('hints at a timer that has run for twelve hours', async () => {
		const { desk } = await worker();
		const started = await desk.post('/project-timer/start', { projectId: bakery });
		// since carries microseconds, the exact boundary is left to the rules tests
		const since = new Date(started.body.since).getTime();
		const now = vi.spyOn(api.app.get(Clock), 'now');
		onTestFinished(() => now.mockRestore());

		now.mockReturnValue(new Date(since + 719 * 60_000));
		expect((await desk.get('/project-timer')).body.hint).toBe(false);
		now.mockReturnValue(new Date(since + 721 * 60_000));
		expect((await desk.get('/project-timer')).body.hint).toBe(true);
	});

	it('answers a stop without a running timer with 409', async () => {
		const { desk } = await worker();
		const answer = await desk.post('/project-timer/stop', {});
		expect(answer.status).toBe(409);
		expect(answer.body).toMatchObject({ code: 'INVALID_STATE' });
	});

	it('refuses a project that is not open to the person', async () => {
		const { desk, employeeId } = await worker();
		const answer = await desk.post('/project-timer/start', { projectId: closed });
		expect(answer.status).toBe(403);
		expect(answer.body).toMatchObject({ code: 'FORBIDDEN' });

		const { rows } = await api.superuser.query(
			'select count(*)::int as entries from app.project_entries where employee_id = $1',
			[employeeId]
		);
		expect(rows[0].entries).toBe(0);
	});

	it('refuses a project that does not exist', async () => {
		const { desk } = await worker();
		const answer = await desk.post('/project-timer/start', {
			projectId: '00000000-0000-4000-8000-000000000000'
		});
		expect(answer.status).toBe(403);
	});

	it('counts the finished entries of colleagues into the budget of an employee', async () => {
		const client = await createClient(api.superuser, tenant, 'Druckerei Blatt');
		const flyer = await createProject(api.superuser, tenant, client, {
			name: 'Flyer',
			budgetMinutes: 150
		});
		const colleague = await worker();
		await colleague.desk.post('/project-entries', {
			projectId: flyer,
			startedAt: '2026-09-22T09:00:00+02:00',
			endedAt: '2026-09-22T11:00:00+02:00',
			note: 'Entwurf'
		});

		const { desk } = await worker();
		const started = await desk.post('/project-timer/start', { projectId: flyer });
		expect(started.body.budget).toMatchObject({ minutes: 150, usedMinutes: 120, state: 'warn' });
		expect((await desk.get('/project-timer')).body.budget.usedMinutes).toBe(120);

		await desk.post('/project-timer/start', { projectId: bakery });
		expect((await desk.get('/project-timer')).body.budget).toBeNull();
	});

	it('takes neither a start time nor an unknown field', async () => {
		const { desk } = await worker();
		const answer = await desk.post('/project-timer/start', {
			projectId: website,
			startedAt: '2026-09-24T06:00:00+02:00'
		});
		expect(answer.status).toBe(400);
		expect(answer.body.code).toBe('VALIDATION');
	});

	it('turns away an account without a personnel record', async () => {
		const { userId } = await createUser(tenant, { role: 'admin' });
		const desk = await signedIn(api, userId);
		expect((await desk.get('/project-timer')).status).toBe(403);
	});

	it('runs in a solo workspace too', async () => {
		const solo = await createTenant({ workspace: 'solo' });
		const freelancer = await createPerson(solo, { role: 'admin' });
		const client = await createClient(api.superuser, solo);
		const project = await createProject(api.superuser, solo, client);
		const desk = await signedIn(api, freelancer.userId);

		const started = await desk.post('/project-timer/start', { projectId: project });
		expect(started.status).toBe(200);
		expect(started.body.state).toBe('running');
	});
});
