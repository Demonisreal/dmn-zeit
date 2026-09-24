import { teamSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { createPerson, createTeam, createTenant, createUser, type Person } from '../helpers/pg';

let api: Api;
let tenant: string;
let hr: Desk;

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	hr = await signedIn(api, (await createUser(tenant, { role: 'hr' })).userId);
});

afterAll(() => api.app.close());

async function renamed(person: Person, displayName: string) {
	await api.superuser.query('update app.users set display_name = $2 where id = $1', [
		person.userId,
		displayName
	]);
}

describe('GET /api/teams', () => {
	it('brings leads and the people still there in one list', async () => {
		const team = await createTeam(tenant, 'Buchhaltung');
		const lead = await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team });
		await renamed(lead, 'Lena Leitung');
		await createPerson(tenant, { teamId: team });
		const left = await createPerson(tenant, { teamId: team });
		await api.superuser.query(`update app.employees set exit_date = '2025-06-30' where id = $1`, [
			left.employeeId
		]);
		const empty = await createTeam(tenant, 'Assistenz');

		const answer = await hr.get('/teams');
		expect(answer.status).toBe(200);
		expect(answer.body.every((row: unknown) => teamSchema.safeParse(row).success)).toBe(true);
		expect(answer.body).toEqual(
			expect.arrayContaining([
				{
					id: team,
					name: 'Buchhaltung',
					leads: [{ id: lead.userId, displayName: 'Lena Leitung' }],
					memberCount: 2
				},
				{ id: empty, name: 'Assistenz', leads: [], memberCount: 0 }
			])
		);
	});

	it('shows no team of another tenant', async () => {
		const foreign = await createTeam(await createTenant());
		const answer = await hr.get('/teams');
		expect(answer.body.map((row: { id: string }) => row.id)).not.toContain(foreign);
	});

	it('is for hr only', async () => {
		const team = await createTeam(tenant);
		const lead = await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team });
		expect((await (await signedIn(api, lead.userId)).get('/teams')).status).toBe(403);
	});
});

describe('POST and PATCH /api/teams', () => {
	it('creates and renames a team', async () => {
		const created = await hr.post('/teams', { name: '  Lohnbuchhaltung ' });
		expect(created.status).toBe(201);
		expect(created.body).toEqual({
			id: expect.any(String),
			name: 'Lohnbuchhaltung',
			leads: [],
			memberCount: 0
		});

		const answer = await hr.patch(`/teams/${created.body.id}`, { name: 'Lohn' });
		expect(answer.status).toBe(200);
		expect(answer.body.name).toBe('Lohn');
		expect((await hr.patch(`/teams/${created.body.id}`, {})).body.name).toBe('Lohn');
	});

	it('checks the name', async () => {
		expect((await hr.post('/teams', { name: '' })).status).toBe(400);
		expect((await hr.post('/teams', { name: 'x'.repeat(81) })).status).toBe(400);
	});

	it('does not find a team of another tenant', async () => {
		const foreign = await createTeam(await createTenant());
		expect((await hr.patch(`/teams/${foreign}`, { name: 'Übernommen' })).status).toBe(404);
	});

	it('is for hr only', async () => {
		const employee = await signedIn(api, (await createPerson(tenant)).userId);
		expect((await employee.post('/teams', { name: 'Eigenes Team' })).status).toBe(403);
	});
});

describe('PUT /api/teams/:id/leads', () => {
	it('replaces the whole list, the old lead loses the team', async () => {
		const team = await createTeam(tenant);
		const member = await createPerson(tenant, { teamId: team });
		const before = await createPerson(tenant, { role: 'team_lead', leads: team });
		const after = await createPerson(tenant, { role: 'team_lead' });
		const asBefore = await signedIn(api, before.userId);
		const asAfter = await signedIn(api, after.userId);
		expect((await asBefore.get(`/employees/${member.employeeId}`)).status).toBe(200);
		expect((await asAfter.get(`/employees/${member.employeeId}`)).status).toBe(403);

		const answer = await hr.put(`/teams/${team}/leads`, { userIds: [after.userId] });
		expect(answer.status).toBe(200);
		expect(answer.body.leads).toEqual([{ id: after.userId, displayName: 'Erika Muster' }]);

		expect((await asBefore.get(`/employees/${member.employeeId}`)).status).toBe(403);
		expect((await asAfter.get(`/employees/${member.employeeId}`)).status).toBe(200);
	});

	it('empties the list', async () => {
		const team = await createTeam(tenant);
		await createPerson(tenant, { role: 'team_lead', leads: team });
		const answer = await hr.put(`/teams/${team}/leads`, { userIds: [] });
		expect(answer.body.leads).toEqual([]);
	});

	it('refuses employees and users of other tenants and keeps the old list', async () => {
		const team = await createTeam(tenant);
		const lead = await createPerson(tenant, { role: 'team_lead', leads: team });
		const employee = await createPerson(tenant);
		const foreign = await createUser(await createTenant(), { role: 'team_lead' });

		for (const userIds of [[employee.userId], [lead.userId, foreign.userId]]) {
			const answer = await hr.put(`/teams/${team}/leads`, { userIds });
			expect(answer.status).toBe(409);
			expect(answer.body.code).toBe('INVALID_STATE');
		}
		const { rows } = await api.superuser.query(
			'select user_id from app.team_leads where team_id = $1',
			[team]
		);
		expect(rows).toEqual([{ user_id: lead.userId }]);
	});

	it('refuses duplicates and more than 20 leads', async () => {
		const team = await createTeam(tenant);
		const lead = await createPerson(tenant, { role: 'team_lead' });
		const twice = await hr.put(`/teams/${team}/leads`, { userIds: [lead.userId, lead.userId] });
		expect(twice.status).toBe(400);
		expect(twice.body.details[0].message).toBe('team.duplicateLead');

		const many = Array.from(
			{ length: 21 },
			(_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
		);
		expect((await hr.put(`/teams/${team}/leads`, { userIds: many })).status).toBe(400);
	});

	it('does not find a team of another tenant', async () => {
		const elsewhere = await createTenant();
		const foreign = await createTeam(elsewhere);
		const lead = await createPerson(tenant, { role: 'team_lead' });
		expect((await hr.put(`/teams/${foreign}/leads`, { userIds: [lead.userId] })).status).toBe(404);
	});

	it('is for hr only, a lead cannot hand the team on', async () => {
		const team = await createTeam(tenant);
		const lead = await createPerson(tenant, { role: 'team_lead', leads: team });
		const asLead = await signedIn(api, lead.userId);
		expect((await asLead.put(`/teams/${team}/leads`, { userIds: [] })).status).toBe(403);
	});
});
