import { personaSchema, sessionSchema, type Persona, type Role, type Session } from '@zeit/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { expectContract, type Browser } from '../auth/api';
import { createTenant, createUser } from '../helpers/pg';
import { openSandbox, startDemo, type Demo } from './sandbox';

let demo: Demo;

beforeAll(async () => {
	demo = await startDemo();
});

afterAll(() => demo.app.close());

async function personaOf(visitor: Browser, role: Role) {
	const { body } = await visitor.get('/demo/personas');
	return (body as Persona[]).find((persona) => persona.role === role)!;
}

describe('GET /api/demo/personas', () => {
	let visitor: Browser;
	let session: Session;
	let answer: request.Response;

	beforeAll(async () => {
		// a second sandbox next to it, whose people must not show up
		[{ visitor, session }] = await Promise.all([openSandbox(demo), openSandbox(demo)]);
		answer = await visitor.get('/demo/personas');
	});

	it('shows the employee every persona of the own sandbox and nobody else', async () => {
		expect(answer.status).toBe(200);
		expectContract(z.array(personaSchema), answer.body);
		const { rows } = await demo.superuser.query<{ id: string }>(
			`select u.id from app.users u join app.tenants t on t.id = u.tenant_id
			  where t.sandbox_group = (select sandbox_group from app.tenants where id = $1)`,
			[session.tenant.id]
		);
		const shown = (answer.body as Persona[]).map((persona) => persona.userId);
		expect(shown.sort()).toEqual(rows.map(({ id }) => id).sort());
	});

	it('marks the persona the visitor is signed in as', () => {
		const current = (answer.body as Persona[]).filter((persona) => persona.current);
		expect(current.map((persona) => persona.userId)).toEqual([session.user.id]);
	});

	it('names the team of everyone with a personnel record', async () => {
		const { rows } = await demo.superuser.query<{ employee: string; id: string; name: string }>(
			`select e.id as employee, tm.id, tm.name
				from app.employees e join app.teams tm on tm.id = e.team_id
				where e.tenant_id = $1`,
			[session.tenant.id]
		);
		const teamOf = new Map(rows.map(({ employee, ...team }) => [employee, team]));
		const personas = answer.body as Persona[];

		for (const persona of personas.filter((p) => p.employee && p.workspace === 'company')) {
			expect(persona.team).toEqual(teamOf.get(persona.employee!.id));
		}
		// the sandbox admin is the one account without a personnel record
		expect(personas.filter((persona) => !persona.employee)).toEqual([
			expect.objectContaining({ role: 'admin', team: null })
		]);
	});

	it('adds the freelancer of the solo workspace as its only persona', () => {
		const solo = (answer.body as Persona[]).filter((persona) => persona.workspace === 'solo');
		expect(solo).toEqual([
			expect.objectContaining({
				displayName: 'Lena Vogt',
				role: 'admin',
				team: null,
				employee: expect.objectContaining({ name: 'Lena Vogt' }),
				current: false
			})
		]);
	});
});

describe('POST /api/demo/switch', () => {
	it('hands out a session for the chosen persona', async () => {
		const { visitor, session } = await openSandbox(demo);
		const hr = await personaOf(visitor, 'hr');
		const before = visitor.cookie;
		const answer = await visitor.post('/demo/switch', { userId: hr.userId });

		expect(answer.status).toBe(200);
		expectContract(sessionSchema, answer.body);
		expect(answer.body).toMatchObject({
			user: { id: hr.userId, role: 'hr' },
			tenant: { id: session.tenant.id }
		});
		visitor.remember(answer);
		expect(visitor.cookie).not.toBe(before);
		expect((await visitor.get('/auth/session')).body.user.id).toBe(hr.userId);
	});

	it('ends the session it switched away from', async () => {
		const { visitor } = await openSandbox(demo);
		const hr = await personaOf(visitor, 'hr');
		const before = visitor.cookie;
		expect((await visitor.post('/demo/switch', { userId: hr.userId })).status).toBe(200);

		visitor.cookie = before;
		expect((await visitor.get('/auth/session')).status).toBe(401);
	});

	it('answers 404 for a persona of another sandbox and keeps the session', async () => {
		const { visitor, session } = await openSandbox(demo);
		const stranger = await createUser(await createTenant({ kind: 'sandbox' }), {
			role: 'admin',
			status: 'demo'
		});

		const answer = await visitor.post('/demo/switch', { userId: stranger.userId });
		expect(answer.status).toBe(404);
		expect(answer.body.code).toBe('NOT_FOUND');
		expect((await visitor.get('/auth/session')).body.user.id).toBe(session.user.id);
	});

	it('crosses into the solo workspace of the same visitor and back', async () => {
		const { visitor, session } = await openSandbox(demo);
		const personas = (await visitor.get('/demo/personas')).body as Persona[];
		const freelancer = personas.find((persona) => persona.workspace === 'solo')!;

		const into = await visitor.post('/demo/switch', { userId: freelancer.userId });
		expect(into.status).toBe(200);
		expectContract(sessionSchema, into.body);
		expect(into.body.tenant).toMatchObject({ kind: 'sandbox', workspace: 'solo' });
		expect(into.body.tenant.id).not.toBe(session.tenant.id);
		visitor.remember(into);

		const fromSolo = (await visitor.get('/demo/personas')).body as Persona[];
		expect(fromSolo.map((persona) => persona.userId).sort()).toEqual(
			personas.map((persona) => persona.userId).sort()
		);
		expect(fromSolo.find((persona) => persona.current)!.userId).toBe(freelancer.userId);

		const back = await visitor.post('/demo/switch', { userId: session.user.id });
		expect(back.status).toBe(200);
		expect(back.body.tenant).toMatchObject({ id: session.tenant.id, workspace: 'company' });
	});

	it('answers 404 for the freelancer of another visitor, from either side', async () => {
		const [mine, theirs] = await Promise.all([openSandbox(demo), openSandbox(demo)]);
		const freelancerOf = async (visitor: Browser) =>
			((await visitor.get('/demo/personas')).body as Persona[]).find(
				(persona) => persona.workspace === 'solo'
			)!;
		const own = await freelancerOf(mine.visitor);
		const stranger = await freelancerOf(theirs.visitor);

		expect((await mine.visitor.post('/demo/switch', { userId: stranger.userId })).status).toBe(404);
		expect((await mine.visitor.get('/auth/session')).body.user.id).toBe(mine.session.user.id);

		const into = await mine.visitor.post('/demo/switch', { userId: own.userId });
		mine.visitor.remember(into);
		expect(
			(await mine.visitor.post('/demo/switch', { userId: theirs.session.user.id })).status
		).toBe(404);
		expect((await mine.visitor.get('/auth/session')).body.user.id).toBe(own.userId);
	});

	it('answers 404 for a persona of an expired sandbox', async () => {
		const { visitor } = await openSandbox(demo);
		const expired = await createTenant({ kind: 'sandbox', expiresIn: '-1 minute' });
		const { userId } = await createUser(expired, { role: 'admin', status: 'demo' });

		expect((await visitor.post('/demo/switch', { userId })).status).toBe(404);
	});

	// the session lookup already drops a sandbox past its expiry, the switch is never reached
	it('answers 401 once the own sandbox has expired', async () => {
		const { visitor, session } = await openSandbox(demo);
		const hr = await personaOf(visitor, 'hr');
		await demo.superuser.query(
			`update app.tenants set expires_at = now() - interval '1 minute' where id = $1`,
			[session.tenant.id]
		);

		expect((await visitor.post('/demo/switch', { userId: hr.userId })).status).toBe(401);
	});

	it.each([
		['without a csrf token', {}],
		['with a wrong csrf token', { 'X-CSRF-Token': 'x'.repeat(43) }]
	])('refuses a switch %s and keeps the session', async (_case, headers) => {
		const { visitor, session } = await openSandbox(demo);
		const hr = await personaOf(visitor, 'hr');
		const answer = await request(demo.http)
			.post('/api/demo/switch')
			.set('X-Forwarded-For', visitor.address)
			.set('Sec-Fetch-Site', 'same-origin')
			.set('Cookie', visitor.cookie!)
			.set(headers)
			.send({ userId: hr.userId });

		expect(answer.status).toBe(403);
		expect(answer.body.code).toBe('CSRF');
		expect((await visitor.get('/auth/session')).body.user.id).toBe(session.user.id);
	});
});
