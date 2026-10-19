import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SandboxPurgeJob } from '../../src/jobs/sandbox-purge.job';
import { fillTenant } from '../db/fixtures';
import { createTenant } from '../helpers/pg';
import { openSandbox, startDemo, type Demo } from './sandbox';

let demo: Demo;
const expired: string[] = [];
let people: string[];
let kept: string[];

async function leftIn(schemas: string[], column: string, ids: string[]) {
	const tables = await demo.superuser.query<{ name: string }>(
		`select table_schema || '.' || table_name as name from information_schema.columns
		  where table_schema = any($1) and column_name = $2`,
		[schemas, column]
	);
	expect(tables.rows.length).toBeGreaterThan(0);
	const left: string[] = [];
	for (const { name } of tables.rows) {
		const { rows } = await demo.superuser.query(
			`select count(*)::int as n from ${name} where ${column} = any($1)`,
			[ids]
		);
		if (rows[0].n > 0) left.push(name);
	}
	return left;
}

// 31 at once with the solo workspaces, the job purges them one call after the other
beforeAll(async () => {
	demo = await startDemo();
	// three with the whole story from the api, the others with a row in every tenant table
	for (let i = 0; i < 3; i++) expired.push((await openSandbox(demo)).session.tenant.id);
	for (let i = 0; i < 25; i++) {
		const tenantId = await createTenant({ kind: 'sandbox' });
		await fillTenant(demo.superuser, tenantId);
		expired.push(tenantId);
	}
	// the solo workspace of each visitor expires with the company
	const solo = await demo.superuser.query<{ id: string }>(
		`select s.id from app.tenants s join app.tenants c on c.sandbox_group = s.sandbox_group
		  where c.id = any($1) and s.workspace = 'solo'`,
		[expired]
	);
	expired.push(...solo.rows.map(({ id }) => id));
	await demo.superuser.query(
		`update app.tenants set expires_at = now() - interval '1 minute' where id = any($1)`,
		[expired]
	);
	// counters from yesterday, the salt behind their keys is gone
	await demo.superuser.query(`update ops.rate_limits set expires_at = now() - interval '1 minute'`);

	kept = [(await openSandbox(demo)).session.tenant.id, await createTenant()];
	const { rows } = await demo.superuser.query<{ id: string }>(
		'select id from app.users where tenant_id = any($1)',
		[expired]
	);
	people = rows.map(({ id }) => id);

	await demo.app.get(SandboxPurgeJob).purgeExpired();
});

afterAll(() => demo.app.close());

describe('SandboxPurgeJob', () => {
	it('purges every expired sandbox in one run, the ones the api wrote included', async () => {
		const { rows } = await demo.superuser.query('select id from app.tenants where id = any($1)', [
			expired
		]);
		expect(rows).toEqual([]);
	});

	it('leaves no row of them in any tenant table', async () => {
		expect(await leftIn(['app', 'audit', 'ops'], 'tenant_id', expired)).toEqual([]);
	});

	it('takes the sessions and factors of their people along', async () => {
		expect(await leftIn(['auth'], 'user_id', people)).toEqual([]);
	});

	it('keeps the running sandbox and the live tenant', async () => {
		const { rows } = await demo.superuser.query<{ id: string }>(
			'select id from app.tenants where id = any($1)',
			[kept]
		);
		expect(rows.map(({ id }) => id).sort()).toEqual([...kept].sort());
	});

	it('drops the used-up address counters of the demo and keeps the running ones', async () => {
		const { rows } = await demo.superuser.query(
			`select count(*) filter (where expires_at <= now())::int as used,
			        count(*) filter (where expires_at > now())::int as running
			   from ops.rate_limits where key like 'demo-sandbox:%'`
		);
		// hour and day of the running visitor, and the hour of all new sandboxes
		expect(rows[0]).toEqual({ used: 0, running: 3 });
	});
});

describe('SandboxPurgeJob with a sandbox that cannot be deleted', () => {
	let stuck: string;
	const behind: string[] = [];

	async function left() {
		const { rows } = await demo.superuser.query<{ id: string }>(
			'select id from app.tenants where id = any($1)',
			[[stuck, ...behind]]
		);
		return rows.map(({ id }) => id);
	}

	beforeAll(async () => {
		stuck = await createTenant({ kind: 'sandbox' });
		await fillTenant(demo.superuser, stuck);
		for (let i = 0; i < 3; i++) behind.push(await createTenant({ kind: 'sandbox' }));
		// due first, a purge that always picks the oldest would never get past it
		await demo.superuser.query(
			`update app.tenants set expires_at = now() - interval '2 hours' where id = $1`,
			[stuck]
		);
		await demo.superuser.query(
			`update app.tenants set expires_at = now() - interval '1 minute' where id = any($1)`,
			[behind]
		);
		await demo.superuser.query(
			`create function public.refuse_purge() returns trigger language plpgsql
			   as $$ begin raise exception 'purge refused for the test'; end $$`
		);
		await demo.superuser.query(
			`create trigger refuse_purge before delete on app.tenants
			   for each row when (old.id = '${stuck}') execute function public.refuse_purge()`
		);

		await demo.app.get(SandboxPurgeJob).purgeExpired();
	});

	it('purges the others and leaves the failing one whole', async () => {
		expect(await left()).toEqual([stuck]);
		expect(await leftIn(['app'], 'tenant_id', [stuck])).not.toEqual([]);
	});

	it('takes it along on the next run once the delete goes through', async () => {
		await demo.superuser.query('drop trigger refuse_purge on app.tenants');
		await demo.app.get(SandboxPurgeJob).purgeExpired();

		expect(await left()).toEqual([]);
		expect(await leftIn(['app', 'audit', 'ops'], 'tenant_id', [stuck])).toEqual([]);
	});
});
