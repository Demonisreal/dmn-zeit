import { contractSchema, employeeSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import {
	createContract,
	createPerson,
	createTeam,
	createTenant,
	createUser,
	insertId,
	type Person
} from '../helpers/pg';

let api: Api;
let tenant: string;
let team: string;
let otherTeam: string;
let lead: Person;
let member: Person;
let colleague: Person;
let stranger: Person;
let model: string;
let hr: Desk;
let asLead: Desk;
let asMember: Desk;

function workModel(tenantId: string, archived = false) {
	return insertId(
		api.superuser,
		`insert into app.work_models (tenant_id, name, min_mon, min_tue, min_wed, min_thu, min_fri,
			min_sat, min_sun, archived_at)
		 values ($1, 'Teilzeit 35 h', 420, 420, 420, 420, 420, 0, 0, case when $2 then now() end)
		 returning id`,
		[tenantId, archived]
	);
}

function newEmployee(overrides: object = {}) {
	return {
		personnelNo: `P-${Math.random().toString(36).slice(2, 8)}`,
		firstName: 'Jonas',
		lastName: 'Becker',
		teamId: team,
		entryDate: '2026-02-01',
		contract: { workModelId: model, vacationDaysYear: '28' },
		...overrides
	};
}

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	team = await createTeam(tenant);
	otherTeam = await createTeam(tenant, 'Lohn');
	lead = await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team });
	member = await createPerson(tenant, { teamId: team });
	colleague = await createPerson(tenant, { teamId: otherTeam });
	stranger = await createPerson(await createTenant());
	model = await workModel(tenant);

	hr = await signedIn(api, (await createUser(tenant, { role: 'hr' })).userId);
	asLead = await signedIn(api, lead.userId);
	asMember = await signedIn(api, member.userId);
});

afterAll(() => api.app.close());

describe('GET /api/employees', () => {
	it('lists the tenant for hr, people who have left only on request', async () => {
		const left = await createPerson(tenant, { teamId: team });
		await api.superuser.query(`update app.employees set exit_date = '2025-06-30' where id = $1`, [
			left.employeeId
		]);

		const current = await hr.get('/employees');
		expect(current.status).toBe(200);
		const ids = current.body.map((employee: { id: string }) => employee.id);
		expect(ids).toEqual(expect.arrayContaining([lead.employeeId, member.employeeId]));
		expect(ids).not.toContain(left.employeeId);
		expect(ids).not.toContain(stranger.employeeId);
		expect(employeeSchema.safeParse(current.body[0]).success).toBe(true);

		const all = await hr.get('/employees?includeExited=true');
		expect(all.body.map((employee: { id: string }) => employee.id)).toContain(left.employeeId);
	});

	it('filters by team and links the user account', async () => {
		const answer = await hr.get(`/employees?team=${otherTeam}`);
		expect(answer.body).toEqual([
			expect.objectContaining({ id: colleague.employeeId, userId: colleague.userId })
		]);
	});

	it('is closed to team leads and employees', async () => {
		expect((await asLead.get('/employees')).status).toBe(403);
		expect((await asMember.get('/employees')).status).toBe(403);
	});
});

describe('POST /api/employees', () => {
	it('creates the employee together with a first contract from the entry date', async () => {
		const answer = await hr.post('/employees', newEmployee());
		expect(answer.status).toBe(201);
		expect(employeeSchema.safeParse(answer.body).success).toBe(true);
		expect(answer.body).toMatchObject({ teamId: team, entryDate: '2026-02-01', exitDate: null });

		const contracts = await hr.get(`/employees/${answer.body.id}/contracts`);
		expect(contracts.body).toEqual([
			expect.objectContaining({
				validFrom: '2026-02-01',
				workModelId: model,
				minutes: { mon: 420, tue: 420, wed: 420, thu: 420, fri: 420, sat: 0, sun: 0 },
				vacationDaysYear: '28.0',
				vacationBasisDays: 5
			})
		]);
	});

	it('refuses an archived work model and leaves no employee behind', async () => {
		const body = newEmployee({
			contract: { workModelId: await workModel(tenant, true), vacationDaysYear: '28' }
		});
		const answer = await hr.post('/employees', body);
		expect(answer.status).toBe(409);
		expect(answer.body.code).toBe('INVALID_STATE');

		const { rowCount } = await api.superuser.query(
			'select 1 from app.employees where personnel_no = $1',
			[body.personnelNo]
		);
		expect(rowCount).toBe(0);
	});

	it('refuses a personnel number that is taken', async () => {
		const body = newEmployee();
		expect((await hr.post('/employees', body)).status).toBe(201);
		const again = await hr.post('/employees', body);
		expect(again.status).toBe(409);
		expect(again.body.code).toBe('ALREADY_EXISTS');
	});

	it('refuses a team or work model of another tenant', async () => {
		const elsewhere = await createTenant();
		const foreignTeam = await hr.post(
			'/employees',
			newEmployee({ teamId: await createTeam(elsewhere) })
		);
		expect(foreignTeam.status).toBe(409);

		const foreignModel = await hr.post(
			'/employees',
			newEmployee({ contract: { workModelId: await workModel(elsewhere), vacationDaysYear: '28' } })
		);
		expect(foreignModel.status).toBe(409);
	});

	it('checks the body', async () => {
		const answer = await hr.post(
			'/employees',
			newEmployee({ lastName: ' ', entryDate: '2026-02-30' })
		);
		expect(answer.status).toBe(400);
		expect(answer.body.details.map((issue: { field: string }) => issue.field).sort()).toEqual([
			'entryDate',
			'lastName'
		]);
	});

	it('is for hr only', async () => {
		expect((await asLead.post('/employees', newEmployee())).status).toBe(403);
	});
});

describe('GET /api/employees/:id', () => {
	it('shows people their own record and their lead the members of the team', async () => {
		const own = await asMember.get(`/employees/${member.employeeId}`);
		expect(own.status).toBe(200);
		expect(own.body).toMatchObject({ id: member.employeeId, userId: member.userId });

		const byLead = await asLead.get(`/employees/${member.employeeId}`);
		expect(byLead.status).toBe(200);
		// a lead may not read other users, so the link stays empty
		expect(byLead.body.userId).toBeNull();
	});

	it('keeps colleagues and other teams out', async () => {
		expect((await asMember.get(`/employees/${lead.employeeId}`)).status).toBe(403);
		expect((await asLead.get(`/employees/${colleague.employeeId}`)).status).toBe(403);
	});

	it('never reaches into another tenant', async () => {
		expect((await hr.get(`/employees/${stranger.employeeId}`)).status).toBe(404);
		expect((await asLead.get(`/employees/${stranger.employeeId}`)).status).toBe(403);
	});

	it('answers 400 for an id that is no uuid', async () => {
		expect((await hr.get('/employees/17')).status).toBe(400);
	});
});

describe('PATCH /api/employees/:id', () => {
	it('renames and moves the employee', async () => {
		const person = await createPerson(tenant, { teamId: team });
		const answer = await hr.patch(`/employees/${person.employeeId}`, {
			lastName: 'Neumann',
			teamId: otherTeam
		});
		expect(answer.status).toBe(200);
		expect(answer.body).toMatchObject({
			firstName: 'Erika',
			lastName: 'Neumann',
			teamId: otherTeam
		});

		const untouched = await hr.patch(`/employees/${person.employeeId}`, {});
		expect(untouched.body).toEqual(answer.body);

		const teamless = await hr.patch(`/employees/${person.employeeId}`, { teamId: null });
		expect(teamless.body.teamId).toBeNull();
	});

	it('is for hr only, the own record included', async () => {
		const answer = await asMember.patch(`/employees/${member.employeeId}`, { lastName: 'Selbst' });
		expect(answer.status).toBe(403);
	});

	it('does not find employees of another tenant', async () => {
		const answer = await hr.patch(`/employees/${stranger.employeeId}`, { lastName: 'Fremd' });
		expect(answer.status).toBe(404);
		const { rows } = await api.superuser.query(
			'select last_name from app.employees where id = $1',
			[stranger.employeeId]
		);
		expect(rows[0].last_name).toBe('Muster');
	});

	it('checks the body', async () => {
		expect((await hr.patch(`/employees/${member.employeeId}`, { firstName: '' })).status).toBe(400);
	});
});

describe('POST /api/employees/:id/exit', () => {
	it('records the last day', async () => {
		const person = await createPerson(tenant);
		const answer = await hr.post(`/employees/${person.employeeId}/exit`, {
			exitDate: '2026-12-31'
		});
		expect(answer.status).toBe(200);
		expect(answer.body.exitDate).toBe('2026-12-31');
	});

	it('refuses an exit before the entry', async () => {
		const answer = await hr.post(`/employees/${member.employeeId}/exit`, {
			exitDate: '2024-12-31'
		});
		expect(answer.status).toBe(400);
	});

	it('is for hr only and stays inside the tenant', async () => {
		const body = { exitDate: '2026-12-31' };
		expect((await asLead.post(`/employees/${member.employeeId}/exit`, body)).status).toBe(403);
		expect((await hr.post(`/employees/${stranger.employeeId}/exit`, body)).status).toBe(404);
	});
});

describe('contracts', () => {
	const contract = (validFrom: string) => ({
		validFrom,
		workModelId: model,
		vacationDaysYear: '30'
	});

	it('adds contracts in order, none before the entry date and none twice on a day', async () => {
		const person = await createPerson(tenant);
		await createContract(tenant, person.employeeId);
		const path = `/employees/${person.employeeId}/contracts`;

		const early = await hr.post(path, contract('2024-12-31'));
		expect(early.status).toBe(400);

		const added = await hr.post(path, contract('2026-07-01'));
		expect(added.status).toBe(201);
		expect(contractSchema.safeParse(added.body).success).toBe(true);
		expect((await hr.post(path, contract('2026-07-01'))).body.code).toBe('ALREADY_EXISTS');

		const history = await hr.get(path);
		expect(history.body.map((row: { validFrom: string }) => row.validFrom)).toEqual([
			'2025-01-01',
			'2026-07-01'
		]);
	});

	it('removes only a later contract that has not started yet', async () => {
		const person = await createPerson(tenant);
		await createContract(tenant, person.employeeId);
		const path = `/employees/${person.employeeId}/contracts`;
		const started = (await hr.post(path, contract('2025-06-01'))).body.id;
		const future = (await hr.post(path, contract('2099-01-01'))).body.id;

		expect((await hr.delete(`${path}/${future}`)).status).toBe(204);
		const past = await hr.delete(`${path}/${started}`);
		expect(past.status).toBe(409);
		expect(past.body.code).toBe('INVALID_STATE');
		expect((await hr.delete(`${path}/${future}`)).status).toBe(404);
	});

	it('keeps the first contract of someone who starts later', async () => {
		const person = await createPerson(tenant, { entryDate: '2099-01-01' });
		const first = await createContract(tenant, person.employeeId);
		const answer = await hr.delete(`/employees/${person.employeeId}/contracts/${first}`);
		expect(answer.status).toBe(409);
	});

	it('does not remove the contract of someone else through another path', async () => {
		const person = await createPerson(tenant);
		await createContract(tenant, person.employeeId);
		const future = (
			await hr.post(`/employees/${person.employeeId}/contracts`, contract('2099-01-01'))
		).body.id;
		const answer = await hr.delete(`/employees/${member.employeeId}/contracts/${future}`);
		expect(answer.status).toBe(404);
	});

	it('is for hr only and stays inside the tenant', async () => {
		const own = `/employees/${member.employeeId}/contracts`;
		expect((await asMember.get(own)).status).toBe(403);
		expect((await asLead.post(own, contract('2026-07-01'))).status).toBe(403);

		const foreign = `/employees/${stranger.employeeId}/contracts`;
		expect((await hr.get(foreign)).status).toBe(404);
		expect((await hr.post(foreign, contract('2026-07-01'))).status).toBe(404);
	});
});
