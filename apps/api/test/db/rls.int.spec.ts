import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectAs, createTenant, createUser, withContext } from '../helpers/pg';
import { fillTenant } from './fixtures';

const tables = [
	'app.absence_days',
	'app.absence_requests',
	'app.contracts',
	'app.correction_requests',
	'app.employees',
	'app.finding_acks',
	'app.flex_bookings',
	'app.month_closings',
	'app.team_leads',
	'app.teams',
	'app.tenants',
	'app.time_entries',
	'app.users',
	'app.vacation_ledger',
	'app.vacation_notices',
	'app.work_models',
	'audit.log'
];

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
	it('knows every table in app and audit', async () => {
		const { rows } = await superuser.query<{ name: string }>(
			`select n.nspname || '.' || c.relname as name
			   from pg_class c
			   join pg_namespace n on n.oid = c.relnamespace
			  where n.nspname in ('app', 'audit') and c.relkind = 'r'
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
			  where n.nspname in ('app', 'audit') and c.relkind = 'r'
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

	it.each(tables)('refuses rows for tenant b in %s', async (table) => {
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
	});
});
