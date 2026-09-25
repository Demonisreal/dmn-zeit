import { projectEntrySchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectContract, startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { createPerson, createTeam, createTenant, type Person } from '../helpers/pg';
import { createClient, createProject, invoice } from './books';

let api: Api;
let tenant: string;
let team: string;
let project: string;
let lead: Person & { desk: Desk };
let hr: Person & { desk: Desk };

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	team = await createTeam(tenant);
	project = await createProject(api.superuser, tenant, await createClient(api.superuser, tenant));
	const leadPerson = await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team });
	const hrPerson = await createPerson(tenant, { role: 'hr' });
	lead = { ...leadPerson, desk: await signedIn(api, leadPerson.userId) };
	hr = { ...hrPerson, desk: await signedIn(api, hrPerson.userId) };
});

afterAll(() => api.app.close());

async function worker() {
	const person = await createPerson(tenant, { teamId: team });
	return { ...person, desk: await signedIn(api, person.userId) };
}

const morning = {
	startedAt: '2026-09-22T09:00:00+02:00',
	endedAt: '2026-09-22T11:00:00+02:00',
	note: 'Startseite überarbeitet'
};

describe('project entries', () => {
	it('books a manual entry for oneself', async () => {
		const { desk, employeeId } = await worker();
		const answer = await desk.post('/project-entries', { projectId: project, ...morning });

		expect(answer.status).toBe(201);
		expectContract(projectEntrySchema, answer.body);
		expect(answer.body).toMatchObject({
			employeeId,
			projectId: project,
			workday: '2026-09-22',
			source: 'manual',
			invoiceId: null
		});
	});

	it('wants a note on a manual entry', async () => {
		const { desk } = await worker();
		const answer = await desk.post('/project-entries', {
			projectId: project,
			startedAt: morning.startedAt,
			endedAt: morning.endedAt
		});

		expect(answer.status).toBe(400);
		expect(answer.body.code).toBe('VALIDATION');
		expect(answer.body.details).toContainEqual(
			expect.objectContaining({ field: 'note', message: 'project.noteRequired' })
		);
	});

	it('refuses an entry that overlaps another one', async () => {
		const { desk } = await worker();
		await desk.post('/project-entries', { projectId: project, ...morning });

		const answer = await desk.post('/project-entries', {
			projectId: project,
			startedAt: '2026-09-22T10:30:00+02:00',
			endedAt: '2026-09-22T12:00:00+02:00',
			note: 'Kontaktformular'
		});
		expect(answer.status).toBe(409);
		expect(answer.body).toMatchObject({ code: 'TIME_OVERLAP' });
	});

	it('refuses a change that moves an entry onto another one', async () => {
		const { desk } = await worker();
		await desk.post('/project-entries', { projectId: project, ...morning });
		const later = await desk.post('/project-entries', {
			projectId: project,
			startedAt: '2026-09-22T13:00:00+02:00',
			endedAt: '2026-09-22T14:00:00+02:00',
			note: 'Kontaktformular'
		});

		const answer = await desk.patch(`/project-entries/${later.body.id}`, {
			startedAt: '2026-09-22T10:30:00+02:00'
		});
		expect(answer.status).toBe(409);
		expect(answer.body).toMatchObject({ code: 'TIME_OVERLAP' });
	});

	it('lets hr book for someone else with a reason that lands in the trail', async () => {
		const { employeeId } = await worker();
		const reason = 'Nachtrag laut Stundenzettel vom Montag';
		const answer = await hr.desk.post('/project-entries', {
			projectId: project,
			...morning,
			employeeId,
			reason
		});
		expect(answer.status).toBe(201);
		expect(answer.body).toMatchObject({ employeeId });

		const { rows } = await api.superuser.query(
			`select actor_user_id, source, table_name, subject_employee_id, diff
			   from audit.log where action = 'project_entry.booked_for_other' and row_id = $1`,
			[answer.body.id]
		);
		expect(rows).toEqual([
			{
				actor_user_id: hr.userId,
				source: 'app',
				table_name: 'project_entries',
				subject_employee_id: employeeId,
				diff: { reason }
			}
		]);
	});

	it('wants the reason when hr books for someone else', async () => {
		const { employeeId } = await worker();
		const answer = await hr.desk.post('/project-entries', {
			projectId: project,
			...morning,
			employeeId
		});
		expect(answer.status).toBe(400);
		expect(answer.body.details).toContainEqual(expect.objectContaining({ field: 'reason' }));
	});

	it('does not let a lead or an employee book for someone else', async () => {
		const colleague = await worker();
		const body = {
			projectId: project,
			...morning,
			employeeId: colleague.employeeId,
			reason: 'Nachtrag laut Stundenzettel vom Montag'
		};

		expect((await lead.desk.post('/project-entries', body)).status).toBe(403);
		expect((await (await worker()).desk.post('/project-entries', body)).status).toBe(403);
	});

	it('changes a finished entry, but not one that is invoiced', async () => {
		const { desk } = await worker();
		const booked = await desk.post('/project-entries', { projectId: project, ...morning });

		const changed = await desk.patch(`/project-entries/${booked.body.id}`, { note: 'Startseite' });
		expect(changed.status).toBe(200);
		expect(changed.body.note).toBe('Startseite');

		await invoice(api.superuser, booked.body.id);
		const locked = await desk.patch(`/project-entries/${booked.body.id}`, { note: 'Impressum' });
		expect(locked.status).toBe(409);
		expect(locked.body).toMatchObject({ code: 'INVOICED' });

		const voided = await desk.post(`/project-entries/${booked.body.id}/void`);
		expect(voided.status).toBe(409);
		expect(voided.body).toMatchObject({ code: 'INVOICED' });
	});

	it('leaves a running timer to the timer routes', async () => {
		const { desk } = await worker();
		const started = await desk.post('/project-timer/start', { projectId: project });

		const answer = await desk.patch(`/project-entries/${started.body.entryId}`, {
			note: 'Impressum'
		});
		expect(answer.status).toBe(409);
	});

	it('voids an entry instead of deleting it', async () => {
		const { desk } = await worker();
		const booked = await desk.post('/project-entries', { projectId: project, ...morning });

		const voided = await desk.post(`/project-entries/${booked.body.id}/void`);
		expect(voided.status).toBe(200);
		expect(voided.body.voidedAt).toEqual(expect.any(String));
		expect((await desk.post(`/project-entries/${booked.body.id}/void`)).status).toBe(409);
	});

	it('lets a lead read the team but change nothing of it', async () => {
		const { desk, employeeId } = await worker();
		const booked = await desk.post('/project-entries', { projectId: project, ...morning });

		const page = await lead.desk.get(
			`/employees/${employeeId}/project-entries?from=2026-09-21&to=2026-09-27`
		);
		expect(page.status).toBe(200);
		expect(page.body).toEqual({ items: [booked.body], nextCursor: null });

		const answer = await lead.desk.patch(`/project-entries/${booked.body.id}`, {
			note: 'Impressum'
		});
		expect(answer.status).toBe(403);
	});

	it('shows an employee nobody else', async () => {
		const colleague = await worker();
		const { desk } = await worker();

		const page = await desk.get(
			`/employees/${colleague.employeeId}/project-entries?from=2026-09-21&to=2026-09-27`
		);
		expect(page.status).toBe(403);
	});

	it('asks for no more than 62 days at once', async () => {
		const { desk, employeeId } = await worker();
		const page = await desk.get(
			`/employees/${employeeId}/project-entries?from=2026-01-01&to=2026-03-31`
		);
		expect(page.status).toBe(400);
	});
});
