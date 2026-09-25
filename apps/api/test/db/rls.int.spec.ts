import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectAs, createTenant, createUser, withContext } from '../helpers/pg';
import { fillTenant } from './fixtures';

const tables = [
	'app.absence_days',
	'app.absence_requests',
	'app.clients',
	'app.contracts',
	'app.correction_requests',
	'app.employees',
	'app.finding_acks',
	'app.flex_bookings',
	'app.month_closings',
	'app.project_entries',
	'app.project_members',
	'app.projects',
	'app.rates',
	'app.tasks',
	'app.team_leads',
	'app.teams',
	'app.tenants',
	'app.time_entries',
	'app.users',
	'app.vacation_ledger',
	'app.vacation_notices',
	'app.work_models',
	'audit.log',
	'ops.demo_outbox'
];

// the hr side of a company; employees and users stay, a solo workspace has its one person in them
const companyOnly = [
	'app.absence_days',
	'app.absence_requests',
	'app.contracts',
	'app.correction_requests',
	'app.finding_acks',
	'app.flex_bookings',
	'app.month_closings',
	'app.team_leads',
	'app.teams',
	'app.time_entries',
	'app.vacation_ledger',
	'app.vacation_notices',
	'app.work_models'
];

// app and audit as a whole, elsewhere every table that carries a tenant_id
const owned = `c.relkind = 'r' and (
	n.nspname in ('app', 'audit')
	or (n.nspname in ('auth', 'ops') and exists (
		select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id'
	))
)`;

const fenceColumn = (table: string) => (table === 'app.tenants' ? 'id' : 'tenant_id');

let superuser: pg.Client;
let app: pg.Client;
let tenantB: string;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');

	const tenantA = await createTenant();
	tenantB = await createTenant();
	await fillTenant(superuser, tenantA);
	await fillTenant(superuser, tenantB);

	const admin = await createUser(tenantA, { role: 'admin' });
	await withContext(app, admin.context);
});

describe('row level security', () => {
	it('knows every table that belongs to a tenant', async () => {
		const { rows } = await superuser.query<{ name: string }>(
			`select n.nspname || '.' || c.relname as name
			   from pg_class c
			   join pg_namespace n on n.oid = c.relnamespace
			  where ${owned}
			  order by 1`
		);
		expect(rows.map((r) => r.name)).toEqual(tables);
	});

	it('fences every table by tenant, forced and restrictive', async () => {
		const { rows } = await superuser.query(
			`select n.nspname || '.' || c.relname as name,
			        c.relrowsecurity as enabled,
			        c.relforcerowsecurity as forced,
			        p.permissive,
			        p.roles::text[] as roles,
			        p.cmd,
			        p.qual
			   from pg_class c
			   join pg_namespace n on n.oid = c.relnamespace
			   left join pg_policies p
			     on p.schemaname = n.nspname and p.tablename = c.relname and p.policyname = 'tenant fence'
			  where ${owned}
			  order by 1`
		);

		for (const row of rows) {
			const column = fenceColumn(row.name);
			expect(row, row.name).toMatchObject({
				enabled: true,
				forced: true,
				permissive: 'RESTRICTIVE',
				roles: ['zeit_app'],
				cmd: 'ALL',
				qual: `(${column} = ( SELECT app.tenant_id() AS tenant_id))`
			});
		}
	});

	// by name across the whole database, so a table too many fails as well as one too few
	it('closes the hr tables and only those to a solo workspace', async () => {
		const { rows } = await superuser.query(
			`select p.schemaname || '.' || p.tablename as name,
			        p.permissive,
			        p.roles::text[] as roles,
			        p.cmd,
			        p.qual
			   from pg_policies p
			  where p.policyname = 'company workspace'
			  order by 1`
		);
		expect(rows.map((r) => r.name)).toEqual(companyOnly);

		for (const row of rows) {
			expect(row, row.name).toMatchObject({
				permissive: 'RESTRICTIVE',
				roles: ['zeit_app'],
				cmd: 'ALL',
				qual: `(( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind)`
			});
		}
	});

	it('gives every tenant-owned table a mandatory tenant_id', async () => {
		const { rows } = await superuser.query<{ name: string }>(
			`select n.nspname || '.' || c.relname as name
			   from pg_class c
			   join pg_namespace n on n.oid = c.relnamespace
			  where n.nspname in ('app', 'audit') and c.relkind = 'r' and c.relname <> 'tenants'
			    and not exists (
			      select 1 from pg_attribute a
			       where a.attrelid = c.oid and a.attname = 'tenant_id' and a.attnotnull
			    )`
		);
		expect(rows).toEqual([]);
	});

	it('shows nothing to a session without context', async () => {
		const bare = await connectAs('app');
		const { rows } = await bare.query('select count(*)::int as n from app.employees');
		expect(rows[0].n).toBe(0);
	});

	it('hides rows from the owner as well, because rls is forced', async () => {
		const owner = await connectAs('owner');
		const { rows } = await owner.query('select count(*)::int as n from app.employees');
		expect(rows[0].n).toBe(0);
	});

	it.each(tables)('shows tenant a no row of tenant b in %s', async (table) => {
		const where = `${fenceColumn(table)} = $1`;
		const seeded = await superuser.query(`select count(*)::int as n from ${table} where ${where}`, [
			tenantB
		]);
		expect(seeded.rows[0].n).toBeGreaterThan(0);

		const seen = await app.query(`select count(*)::int as n from ${table} where ${where}`, [
			tenantB
		]);
		expect(seen.rows[0].n).toBe(0);
	});

	// zeit_app has no insert on app.tenants at all, access.int.spec.ts covers that
	it.each(tables.filter((table) => table !== 'app.tenants'))(
		'refuses rows for tenant b in %s',
		async (table) => {
			const { rows } = await superuser.query(
				`select to_jsonb(t) as row from ${table} t where ${fenceColumn(table)} = $1 limit 1`,
				[tenantB]
			);
			// every column zeit_app may fill, except the key, so only the fence can object
			const columns = await superuser.query<{ name: string }>(
				`select a.attname as name
			   from pg_attribute a
			  where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped
			    and a.attgenerated = '' and a.attidentity = '' and a.attname <> 'id'
			    and has_column_privilege('zeit_app', a.attrelid, a.attname, 'INSERT')`,
				[table]
			);
			const list = columns.rows.map((c) => `"${c.name}"`).join(', ');

			await expect(
				app.query(
					`insert into ${table} (${list}) select ${list} from jsonb_populate_record(null::${table}, $1)`,
					[rows[0].row]
				)
			).rejects.toMatchObject({
				code: '42501',
				message: expect.stringContaining('row-level security')
			});
		}
	);
});
