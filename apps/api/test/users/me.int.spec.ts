import { userSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api } from '../auth/api';
import { signedIn } from '../helpers/desk';
import { createPerson, createTenant, createUser } from '../helpers/pg';

let api: Api;
let tenant: string;

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
});

afterAll(() => api.app.close());

describe('GET /api/me', () => {
	it('shows the own user', async () => {
		const person = await createPerson(tenant);
		const answer = await (await signedIn(api, person.userId)).get('/me');
		expect(answer.status).toBe(200);
		expect(userSchema.safeParse(answer.body).success).toBe(true);
		expect(answer.body).toMatchObject({
			id: person.userId,
			role: 'employee',
			employeeId: person.employeeId,
			status: 'active'
		});
	});

	it('answers 401 without a session', async () => {
		expect((await api.browser().get('/me')).status).toBe(401);
	});
});

describe('PATCH /api/me', () => {
	it('changes name and language', async () => {
		const person = await createPerson(tenant);
		const desk = await signedIn(api, person.userId);
		const answer = await desk.patch('/me', { displayName: ' Erika M. ', locale: 'en' });
		expect(answer.status).toBe(200);
		expect(answer.body).toMatchObject({ displayName: 'Erika M.', locale: 'en' });
		expect((await desk.patch('/me', {})).body).toEqual(answer.body);
	});

	it('leaves role, employee and status alone whatever is sent', async () => {
		const admin = await createUser(tenant, { role: 'admin' });
		const desk = await signedIn(api, admin.userId);
		const answer = await desk.patch('/me', {
			role: 'employee',
			status: 'disabled',
			employeeId: null,
			locale: 'en'
		});
		expect(answer.status).toBe(200);
		expect(answer.body).toMatchObject({ role: 'admin', status: 'active', locale: 'en' });
	});

	it('checks the body', async () => {
		const desk = await signedIn(api, (await createPerson(tenant)).userId);
		expect((await desk.patch('/me', { displayName: '' })).status).toBe(400);
		expect((await desk.patch('/me', { locale: 'fr' })).status).toBe(400);
	});
});
