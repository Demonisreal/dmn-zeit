import { sessionSchema } from '@zeit/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_SANDBOXES_PER_HOUR } from '../../src/demo/demo.service';
import { expectContract, type Browser } from '../auth/api';
import { connectAs, createTenant, withContext } from '../helpers/pg';
import { openSandbox, startDemo, type Demo } from './sandbox';

let demo: Demo;

beforeAll(async () => {
	demo = await startDemo();
});

afterAll(() => demo.app.close());

describe('POST /api/demo/sandboxes', () => {
	it('opens a sandbox tenant that expires in 24 hours', async () => {
		const { session } = await openSandbox(demo);
		const { rows } = await demo.superuser.query(
			`select kind, abs(extract(epoch from expires_at - (now() + interval '24 hours'))) < 60 as one_day
			   from app.tenants where id = $1`,
			[session.tenant.id]
		);
		expect(rows).toEqual([{ kind: 'sandbox', one_day: true }]);
	});

	it('writes the whole story into it', async () => {
		const { session } = await openSandbox(demo);
		const { rows } = await demo.superuser.query(
			`select (select count(*) from app.teams where tenant_id = $1)::int as teams,
			        (select count(*) from app.employees where tenant_id = $1)::int as employees,
			        (select count(*) from app.users where tenant_id = $1 and status = 'demo')::int as personas,
			        exists (select 1 from app.time_entries where tenant_id = $1) as entries,
			        exists (select 1 from app.absence_requests where tenant_id = $1) as absences,
			        exists (select 1 from app.month_closings where tenant_id = $1) as closings`,
			[session.tenant.id]
		);
		expect(rows[0]).toEqual({
			teams: 3,
			employees: 12,
			personas: 13,
			entries: true,
			absences: true,
			closings: true
		});
	});

	it('signs the visitor in as the employee who clocked in this morning', async () => {
		const { visitor, session } = await openSandbox(demo);
		expectContract(sessionSchema, session);
		expect(session).toMatchObject({
			mode: 'demo',
			user: { role: 'employee', status: 'demo' },
			tenant: { kind: 'sandbox' }
		});

		const { rows } = await demo.superuser.query(
			`select u.id from app.time_entries e join app.users u on u.employee_id = e.employee_id
			  where e.tenant_id = $1 and e.ended_at is null
			    and (e.started_at at time zone 'Europe/Berlin')::date = (now() at time zone 'Europe/Berlin')::date`,
			[session.tenant.id]
		);
		expect(rows).toEqual([{ id: session.user.id }]);

		const current = await visitor.get('/auth/session');
		expect(current.status).toBe(200);
		expect(current.body.user.id).toBe(session.user.id);
	});
});

describe('address limit', () => {
	let crowded: Browser;

	beforeAll(async () => {
		crowded = demo.visitor();
		for (let i = 0; i < 3; i++) await openSandbox(demo, crowded);
	});

	it('turns the fourth sandbox within the hour away until the window ends', async () => {
		const answer = await crowded.post('/demo/sandboxes', { locale: 'de' });

		expect(answer.status).toBe(429);
		expect(answer.body).toMatchObject({
			code: 'RATE_LIMITED',
			details: { retryAfter: expect.any(Number) }
		});
		expect(answer.headers['retry-after']).toBe(String(answer.body.details.retryAfter));
		// the window opened with the first of the three, a few seconds ago
		expect(answer.body.details.retryAfter).toBeGreaterThan(3500);
		expect(answer.body.details.retryAfter).toBeLessThanOrEqual(3600);
	});

	it('counts the whole /24 as one address', async () => {
		const neighbour = demo.visitor(crowded.address.replace(/\d+$/, '201'));
		expect((await neighbour.post('/demo/sandboxes', { locale: 'de' })).status).toBe(429);
	});

	it('leaves another address alone', async () => {
		expect((await crowded.post('/demo/sandboxes', { locale: 'de' })).status).toBe(429);
		expect((await demo.visitor().post('/demo/sandboxes', { locale: 'de' })).status).toBe(201);
	});

	// ten sandboxes at three an hour would take the afternoon, the counters are moved on instead
	it('turns the eleventh sandbox of the day away until midnight in Berlin', async () => {
		const visitor = demo.visitor();
		const before = await demo.superuser.query<{ key: string }>('select key from ops.rate_limits');
		await openSandbox(demo, visitor);
		await demo.superuser.query(
			`update ops.rate_limits
			    set hits = case when key like 'demo-sandbox:day:%' then 10 else hits end,
			        expires_at = case when key like 'demo-sandbox:hour:%' then now() else expires_at end
			  where key <> all($1)`,
			[before.rows.map(({ key }) => key)]
		);

		const answer = await visitor.post('/demo/sandboxes', { locale: 'de' });
		expect(answer.status).toBe(429);
		const { rows } = await demo.superuser.query(
			`select extract(epoch from ((now() at time zone 'Europe/Berlin')::date + 1)::timestamp
			   at time zone 'Europe/Berlin' - now())::int as midnight`
		);
		expect(Math.abs(answer.body.details.retryAfter - rows[0].midnight)).toBeLessThan(5);
	});
});

describe('hour limit for everyone', () => {
	async function opened() {
		const { rows } = await demo.superuser.query(
			`select hits from ops.rate_limits where key = 'demo-sandbox:opened'`
		);
		return rows[0].hits as number;
	}

	it('counts the sandboxes it opens, not the visitors it turns away', async () => {
		const crowded = demo.visitor();
		for (let i = 0; i < 3; i++) await openSandbox(demo, crowded);
		const before = await opened();

		expect((await crowded.post('/demo/sandboxes', { locale: 'de' })).status).toBe(429);
		expect(await opened()).toBe(before);
		await openSandbox(demo);
		expect(await opened()).toBe(before + 1);
	});

	it(`turns sandbox ${MAX_SANDBOXES_PER_HOUR + 1} of the hour away with 503 until the hour is over`, async () => {
		await demo.superuser.query(
			`update ops.rate_limits set hits = $1, expires_at = now() + interval '20 minutes'
			  where key = 'demo-sandbox:opened'`,
			[MAX_SANDBOXES_PER_HOUR - 1]
		);
		await openSandbox(demo);

		const answer = await demo.visitor().post('/demo/sandboxes', { locale: 'de' });
		expect(answer.status).toBe(503);
		expect(answer.body).toMatchObject({
			code: 'SANDBOX_LIMIT',
			message: 'Too many demo sandboxes',
			details: { retryAfter: expect.any(Number) }
		});
		expect(answer.headers['retry-after']).toBe(String(answer.body.details.retryAfter));
		expect(answer.body.details.retryAfter).toBeGreaterThan(1190);
		expect(answer.body.details.retryAfter).toBeLessThanOrEqual(1200);
	});

	it('opens sandboxes again once the hour is over', async () => {
		await demo.superuser.query(
			`update ops.rate_limits set expires_at = now() where key = 'demo-sandbox:opened'`
		);
		await openSandbox(demo);
		expect(await opened()).toBe(1);
	});
});

describe('ops.sandbox_create', () => {
	let app: pg.Client;

	beforeAll(async () => {
		app = await connectAs('app');
		await app.query(`select set_config('app.demo_mode', 'true', false)`);
	});

	it('takes neither kind nor expiry from the caller', async () => {
		const { rows } = await demo.superuser.query(
			`select pg_get_function_identity_arguments(p.oid) as args
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'ops' and p.proname = 'sandbox_create'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].args).not.toMatch(/tenant_kind|timestamp|interval/);
	});

	it('cannot turn a live tenant into a sandbox by its id', async () => {
		const live = await createTenant();
		await withContext(app, { tenantId: live, role: 'admin' });
		await expect(
			app.query(
				`select ops.sandbox_create($1, 'Musterbetrieb (Beispiel)', $2, 'NW', 600, 300, 'warn')`,
				[live, `musterbetrieb-${live.slice(0, 8)}`]
			)
		).rejects.toMatchObject({ code: '23505' });

		const { rows } = await demo.superuser.query(
			'select kind, expires_at from app.tenants where id = $1',
			[live]
		);
		expect(rows).toEqual([{ kind: 'live', expires_at: null }]);
	});
});
