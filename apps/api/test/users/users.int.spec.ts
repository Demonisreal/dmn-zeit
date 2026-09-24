import { userSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { createPerson, createTenant, createUser, type Account } from '../helpers/pg';

let api: Api;
let tenant: string;
let adminAccount: Account;
let admin: Desk;
let confirmed: Desk;

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	adminAccount = await createUser(tenant, { role: 'admin' });
	admin = await signedIn(api, adminAccount.userId);
	confirmed = await signedIn(api, adminAccount.userId, { reauth: true });
});

afterAll(() => api.app.close());

let lastMail = 0;
const address = () => `neu-${++lastMail}-${Date.now()}@example.test`;

function mailsTo(email: string) {
	return api.mails.filter((mail) => mail.to === email);
}

function tokenOf(text: string) {
	return /\/invite#t=([\w-]{43})/.exec(text)?.[1];
}

describe('GET /api/users', () => {
	it('lists the users of the own tenant for admins', async () => {
		const colleague = await createUser(tenant, { role: 'hr' });
		const foreign = await createUser(await createTenant());
		const answer = await admin.get('/users');
		expect(answer.status).toBe(200);
		expect(answer.body.every((row: unknown) => userSchema.safeParse(row).success)).toBe(true);
		const ids = answer.body.map((user: { id: string }) => user.id);
		expect(ids).toEqual(expect.arrayContaining([adminAccount.userId, colleague.userId]));
		expect(ids).not.toContain(foreign.userId);
	});

	it('is for admins only', async () => {
		const hr = await signedIn(api, (await createUser(tenant, { role: 'hr' })).userId);
		expect((await hr.get('/users')).status).toBe(403);
	});
});

describe('POST /api/users', () => {
	it('creates an invited user and sends exactly one invitation that works', async () => {
		const email = address();
		const answer = await admin.post('/users', {
			email: email.toUpperCase(),
			displayName: 'Jonas Becker',
			role: 'team_lead',
			locale: 'en'
		});
		expect(answer.status).toBe(201);
		expect(userSchema.safeParse(answer.body).success).toBe(true);
		expect(answer.body).toMatchObject({
			email,
			role: 'team_lead',
			locale: 'en',
			status: 'invited',
			employeeId: null,
			lastLoginAt: null
		});

		await vi.waitFor(() => expect(mailsTo(email)).toHaveLength(1));
		const [mail] = mailsTo(email);
		expect(mail!.subject).toBe('Invitation to DMN Zeit (Steuerbüro Beispiel)');
		expect(mail!.text).toContain('http://localhost:5173/invite#t=');

		const inspect = await api.browser().post('/auth/invitations/inspect', {
			token: tokenOf(mail!.text)
		});
		expect(inspect.status).toBe(200);
		expect(inspect.body).toEqual({
			email,
			displayName: 'Jonas Becker',
			tenantName: 'Steuerbüro Beispiel'
		});
	});

	it('links the account to an employee of the own tenant only', async () => {
		const person = await createPerson(tenant);
		await api.superuser.query('update app.users set employee_id = null where id = $1', [
			person.userId
		]);
		const linked = await admin.post('/users', {
			email: address(),
			displayName: 'Erika Muster',
			role: 'employee',
			employeeId: person.employeeId
		});
		expect(linked.status).toBe(201);
		expect(linked.body.employeeId).toBe(person.employeeId);

		const foreign = await createPerson(await createTenant());
		const answer = await admin.post('/users', {
			email: address(),
			displayName: 'Max Fremd',
			role: 'employee',
			employeeId: foreign.employeeId
		});
		expect(answer.status).toBe(409);
	});

	it('refuses an address that is taken', async () => {
		const email = address();
		const body = { email, displayName: 'Doppelt', role: 'employee' };
		expect((await admin.post('/users', body)).status).toBe(201);
		const again = await admin.post('/users', body);
		expect(again.status).toBe(409);
		expect(again.body.code).toBe('ALREADY_EXISTS');
		await vi.waitFor(() => expect(mailsTo(email)).toHaveLength(1));
	});

	it('checks the body', async () => {
		const answer = await admin.post('/users', {
			email: 'keine-adresse',
			displayName: '',
			role: 'chef'
		});
		expect(answer.status).toBe(400);
		expect(answer.body.details.map((issue: { field: string }) => issue.field).sort()).toEqual([
			'displayName',
			'email',
			'role'
		]);
	});

	it('is for admins only', async () => {
		const hr = await signedIn(api, (await createUser(tenant, { role: 'hr' })).userId);
		const email = address();
		const answer = await hr.post('/users', { email, displayName: 'Heimlich', role: 'admin' });
		expect(answer.status).toBe(403);
		const { rowCount } = await api.superuser.query('select 1 from app.users where email = $1', [
			email
		]);
		expect(rowCount).toBe(0);
	});
});

describe('POST /api/users/:id/invite', () => {
	it('sends a new link and the old one stops working', async () => {
		const email = address();
		const { id } = (await admin.post('/users', { email, displayName: 'Lena', role: 'employee' }))
			.body;
		await vi.waitFor(() => expect(mailsTo(email)).toHaveLength(1));

		expect((await admin.post(`/users/${id}/invite`)).status).toBe(204);
		await vi.waitFor(() => expect(mailsTo(email)).toHaveLength(2));
		const [first, second] = mailsTo(email).map((mail) => tokenOf(mail.text));
		expect(mailsTo(email)[1]!.subject).toBe('Einladung zu DMN Zeit (Steuerbüro Beispiel)');

		const browser = api.browser();
		expect((await browser.post('/auth/invitations/inspect', { token: first })).status).toBe(400);
		expect((await browser.post('/auth/invitations/inspect', { token: second })).status).toBe(200);
	});

	it('invites only who has not accepted yet', async () => {
		const active = await createUser(tenant);
		const answer = await admin.post(`/users/${active.userId}/invite`);
		expect(answer.status).toBe(409);
		expect(answer.body.code).toBe('INVALID_STATE');
	});

	it('does not find users of another tenant', async () => {
		const foreign = await createUser(await createTenant(), { status: 'invited' });
		expect((await admin.post(`/users/${foreign.userId}/invite`)).status).toBe(404);
	});

	it('is for admins only', async () => {
		const invited = await createUser(tenant, { status: 'invited' });
		const hr = await signedIn(api, (await createUser(tenant, { role: 'hr' })).userId);
		expect((await hr.post(`/users/${invited.userId}/invite`)).status).toBe(403);
	});
});

describe('PATCH /api/users/:id', () => {
	it('wants a fresh confirmation', async () => {
		const person = await createPerson(tenant);
		const answer = await admin.patch(`/users/${person.userId}`, { role: 'hr' });
		expect(answer.status).toBe(403);
		expect(answer.body.code).toBe('REAUTH_REQUIRED');
	});

	it('changes the role and ends every session of the person', async () => {
		const person = await createPerson(tenant);
		const laptop = await signedIn(api, person.userId);
		const phone = await signedIn(api, person.userId);

		const answer = await confirmed.patch(`/users/${person.userId}`, { role: 'hr' });
		expect(answer.status).toBe(200);
		expect(answer.body.role).toBe('hr');
		expect((await laptop.get('/me')).status).toBe(401);
		expect((await phone.get('/me')).status).toBe(401);
		expect((await confirmed.get('/me')).status).toBe(200);

		const { rows } = await api.superuser.query(
			`select diff from audit.log where table_name = 'users' and row_id = $1 and action = 'update'`,
			[person.userId]
		);
		expect(rows).toEqual([{ diff: { role: ['employee', 'hr'] } }]);
	});

	it('keeps the sessions when only name or language change', async () => {
		const person = await createPerson(tenant);
		const laptop = await signedIn(api, person.userId);
		const answer = await confirmed.patch(`/users/${person.userId}`, {
			displayName: 'Erika Neumann',
			locale: 'en',
			role: 'employee'
		});
		expect(answer.body).toMatchObject({ displayName: 'Erika Neumann', locale: 'en' });
		expect((await laptop.get('/me')).status).toBe(200);
	});

	it('moves the employee link and ends the sessions', async () => {
		const person = await createPerson(tenant);
		const other = await createPerson(tenant);
		await api.superuser.query('update app.users set employee_id = null where id = $1', [
			other.userId
		]);
		const laptop = await signedIn(api, person.userId);
		const answer = await confirmed.patch(`/users/${person.userId}`, {
			employeeId: other.employeeId
		});
		expect(answer.body.employeeId).toBe(other.employeeId);
		expect((await laptop.get('/me')).status).toBe(401);
	});

	it('never changes the own role', async () => {
		const answer = await confirmed.patch(`/users/${adminAccount.userId}`, { role: 'employee' });
		expect(answer.status).toBe(403);
		expect((await confirmed.get('/me')).body.role).toBe('admin');
	});

	it('does not find users of another tenant', async () => {
		const foreign = await createUser(await createTenant());
		expect((await confirmed.patch(`/users/${foreign.userId}`, { role: 'admin' })).status).toBe(404);
	});

	it('checks the body and the role of the caller', async () => {
		const person = await createPerson(tenant);
		expect((await confirmed.patch(`/users/${person.userId}`, { role: 'chef' })).status).toBe(400);

		const hr = await signedIn(api, (await createUser(tenant, { role: 'hr' })).userId, {
			reauth: true
		});
		expect((await hr.patch(`/users/${person.userId}`, { role: 'admin' })).status).toBe(403);
	});
});

describe('POST /api/users/:id/disable', () => {
	it('wants a fresh confirmation', async () => {
		const person = await createPerson(tenant);
		const answer = await admin.post(`/users/${person.userId}/disable`);
		expect(answer.status).toBe(403);
		expect(answer.body.code).toBe('REAUTH_REQUIRED');
	});

	it('disables the account and signs the person out everywhere', async () => {
		const person = await createPerson(tenant);
		const laptop = await signedIn(api, person.userId);
		const answer = await confirmed.post(`/users/${person.userId}/disable`);
		expect(answer.status).toBe(200);
		expect(answer.body.status).toBe('disabled');
		expect(Object.keys(answer.body).sort()).toEqual(Object.keys(userSchema.shape).sort());
		expect((await laptop.get('/me')).status).toBe(401);

		const { rowCount } = await api.superuser.query(
			'select 1 from auth.sessions where user_id = $1',
			[person.userId]
		);
		expect(rowCount).toBe(0);
	});

	it('leaves a second disable harmless', async () => {
		const person = await createPerson(tenant);
		await confirmed.post(`/users/${person.userId}/disable`);
		const again = await confirmed.post(`/users/${person.userId}/disable`);
		expect(again.status).toBe(200);
		expect(again.body.status).toBe('disabled');
	});

	it('never disables the own account', async () => {
		expect((await confirmed.post(`/users/${adminAccount.userId}/disable`)).status).toBe(403);
	});

	it('does not find users of another tenant', async () => {
		const foreign = await createUser(await createTenant());
		const laptop = await signedIn(api, foreign.userId);
		expect((await confirmed.post(`/users/${foreign.userId}/disable`)).status).toBe(404);
		expect((await laptop.get('/me')).status).toBe(200);
	});

	it('is for admins only', async () => {
		const person = await createPerson(tenant);
		const hr = await signedIn(api, (await createUser(tenant, { role: 'hr' })).userId, {
			reauth: true
		});
		expect((await hr.post(`/users/${person.userId}/disable`)).status).toBe(403);
	});
});

describe('POST /api/users/:id/enable', () => {
	it('rejects an invited account, that has to accept its invitation instead', async () => {
		const invited = await createUser(tenant, { status: 'invited' });
		const answer = await confirmed.post(`/users/${invited.userId}/enable`);
		expect(answer.status).toBe(409);
		expect(answer.body.code).toBe('INVALID_STATE');
	});

	it('leaves an already active account untouched', async () => {
		const person = await createPerson(tenant);
		const answer = await confirmed.post(`/users/${person.userId}/enable`);
		expect(answer.status).toBe(200);
		expect(answer.body.status).toBe('active');
	});

	it('reactivates a disabled account', async () => {
		const person = await createPerson(tenant);
		await confirmed.post(`/users/${person.userId}/disable`);
		const answer = await confirmed.post(`/users/${person.userId}/enable`);
		expect(answer.status).toBe(200);
		expect(answer.body.status).toBe('active');
	});

	it('leaves a second enable harmless', async () => {
		const person = await createPerson(tenant);
		await confirmed.post(`/users/${person.userId}/disable`);
		await confirmed.post(`/users/${person.userId}/enable`);
		const again = await confirmed.post(`/users/${person.userId}/enable`);
		expect(again.status).toBe(200);
		expect(again.body.status).toBe('active');
	});

	it('wants a fresh confirmation', async () => {
		const person = await createPerson(tenant);
		await confirmed.post(`/users/${person.userId}/disable`);
		const answer = await admin.post(`/users/${person.userId}/enable`);
		expect(answer.status).toBe(403);
		expect(answer.body.code).toBe('REAUTH_REQUIRED');
	});
});
