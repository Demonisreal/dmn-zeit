import { randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetMfa } from '../../src/cli/mfa-reset';
import { archiveTenant } from '../../src/cli/tenant-archive';
import { createTenant as tenantCreate, type NewTenant } from '../../src/cli/tenant-create';
import { Database } from '../../src/db/database';
import { connectAs, createPerson, createTenant, createUser, databaseUrl } from '../helpers/pg';

// the cli connects as zeit_owner, like CLI_DATABASE_URL in production
let db: Database;
let superuser: pg.Client;

beforeAll(async () => {
	db = new Database(databaseUrl('owner'));
	superuser = await connectAs('superuser');
});

afterAll(() => db.destroy());

async function openSession(userId: string) {
	await superuser.query(
		`insert into auth.sessions (user_id, token_hash, csrf_hash, idle_expires_at, absolute_expires_at)
		 values ($1, $2, $3, now() + interval '12 hours', now() + interval '7 days')`,
		[userId, randomBytes(32), randomBytes(32)]
	);
}

async function count(from: string, values: unknown[]) {
	const { rows } = await superuser.query<{ n: number }>(
		`select count(*)::int as n from ${from}`,
		values
	);
	return rows[0]!.n;
}

describe('tenant:create', () => {
	const solo = (): NewTenant => ({
		name: 'Erika Muster IT-Beratung',
		slug: `solo-${randomUUID().slice(0, 8)}`,
		state: 'NW',
		adminEmail: `${randomUUID()}@example.test`,
		adminName: 'Erika Muster',
		workspace: 'solo',
		firstName: 'Erika',
		lastName: 'Muster'
	});

	it('opens a solo workspace with one person who is its admin', async () => {
		const tenant = solo();
		const link = await tenantCreate(db, tenant, 'http://localhost:5173');
		expect(link).toMatch(/^http:\/\/localhost:5173\/invite#t=[\w-]{43}$/);

		const { rows: tenants } = await superuser.query(
			'select id, workspace from app.tenants where slug = $1',
			[tenant.slug]
		);
		expect(tenants).toEqual([{ id: expect.any(String), workspace: 'solo' }]);

		const { rows: employees } = await superuser.query(
			'select id, personnel_no, first_name, last_name from app.employees where tenant_id = $1',
			[tenants[0].id]
		);
		expect(employees).toEqual([
			{ id: expect.any(String), personnel_no: '1', first_name: 'Erika', last_name: 'Muster' }
		]);

		const { rows: users } = await superuser.query(
			'select email, role, employee_id from app.users where tenant_id = $1',
			[tenants[0].id]
		);
		expect(users).toEqual([
			{ email: tenant.adminEmail, role: 'admin', employee_id: employees[0].id }
		]);
	});

	it('refuses a solo workspace without the name of its person', async () => {
		const tenant = { ...solo(), firstName: undefined, lastName: undefined };
		await expect(tenantCreate(db, tenant, 'http://localhost:5173')).rejects.toMatchObject({
			code: 'ZT003'
		});
		expect(await count('app.tenants where slug = $1', [tenant.slug])).toBe(0);
	});

	it('gives a company no personnel record for the admin', async () => {
		const tenant: NewTenant = {
			name: 'Steuerbüro Neu',
			slug: `neu-${randomUUID().slice(0, 8)}`,
			state: 'NW',
			adminEmail: `${randomUUID()}@example.test`,
			adminName: 'Anna Admin',
			firstName: 'Anna',
			lastName: 'Admin'
		};
		await tenantCreate(db, tenant, 'http://localhost:5173');

		const { rows } = await superuser.query(
			`select t.workspace, u.employee_id,
			        (select count(*)::int from app.employees e where e.tenant_id = t.id) as employees
			   from app.tenants t join app.users u on u.tenant_id = t.id
			  where t.slug = $1`,
			[tenant.slug]
		);
		expect(rows).toEqual([{ workspace: 'company', employee_id: null, employees: 0 }]);
	});
});

describe('user:mfa-reset', () => {
	async function factorsOf(userId: string) {
		const { rows } = await superuser.query('select * from auth.factors($1)', [userId]);
		return rows[0];
	}

	async function enrolled() {
		const tenant = await createTenant({ workspace: 'solo' });
		const person = await createPerson(tenant, { role: 'admin' });
		await superuser.query(`select auth.totp_begin($1, $2, 1)`, [person.userId, randomBytes(48)]);
		await superuser.query(`select auth.totp_confirm($1, 1000, $2)`, [
			person.userId,
			Array.from({ length: 10 }, () => randomBytes(32))
		]);
		await superuser.query(
			`select auth.passkey_add($1, $2, $3, 0, '{internal}', null, false, 'Laptop')`,
			[person.userId, randomBytes(32), randomBytes(77)]
		);
		await openSession(person.userId);
		const { rows } = await superuser.query('select email from app.users where id = $1', [
			person.userId
		]);
		return { ...person, tenant, email: rows[0].email as string };
	}

	it('removes every factor and session of the person behind the email', async () => {
		const person = await enrolled();
		const reset = await resetMfa(db, person.email.toUpperCase());
		expect(reset).toEqual({
			userId: person.userId,
			tenantId: person.tenant,
			displayName: 'Erika Muster',
			locale: 'de',
			email: person.email
		});

		expect(await factorsOf(person.userId)).toEqual({
			has_totp: false,
			passkey_count: 0,
			recovery_left: 0
		});
		expect(await count('auth.sessions where user_id = $1', [person.userId])).toBe(0);
	});

	it('files the reset in the trail as the cli', async () => {
		const person = await enrolled();
		await resetMfa(db, person.email);
		const { rows } = await superuser.query(
			`select actor_user_id, actor_role, source, table_name, row_id, subject_employee_id
			   from audit.log where tenant_id = $1 and action = 'mfa.reset'`,
			[person.tenant]
		);
		expect(rows).toEqual([
			{
				actor_user_id: null,
				actor_role: 'admin',
				source: 'cli',
				table_name: 'users',
				row_id: person.userId,
				subject_employee_id: person.employeeId
			}
		]);
	});

	it('touches nothing for an unknown email', async () => {
		const person = await enrolled();
		expect(await resetMfa(db, 'niemand@example.test')).toBeUndefined();
		expect((await factorsOf(person.userId)).passkey_count).toBe(1);
		expect(
			await count(`audit.log where action = 'mfa.reset' and tenant_id = $1`, [person.tenant])
		).toBe(0);
	});

	it('hands back the context the caller had set', async () => {
		const person = await enrolled();
		const owner = await connectAs('owner');
		await owner.query('begin');
		await owner.query(
			`select set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true),
				set_config('app.role', 'hr', true)`,
			[randomUUID(), randomUUID()]
		);
		const before = await owner.query(
			`select current_setting('app.tenant_id') as tenant, current_setting('app.user_id') as "user",
				current_setting('app.role') as role`
		);
		await owner.query('select * from ops.mfa_reset_operator($1)', [person.email]);
		const after = await owner.query(
			`select current_setting('app.tenant_id') as tenant, current_setting('app.user_id') as "user",
				current_setting('app.role') as role`
		);
		await owner.query('commit');
		expect(after.rows[0]).toEqual(before.rows[0]);
	});
});

describe('tenant:archive', () => {
	async function staffed() {
		const tenant = await createTenant();
		const worker = await createPerson(tenant);
		const admin = await createUser(tenant, { role: 'admin' });
		await superuser.query(
			`insert into app.time_entries (tenant_id, employee_id, started_at, ended_at, source)
			 values ($1, $2, '2026-02-02 08:00+01', '2026-02-02 12:00+01', 'seed')`,
			[tenant, worker.employeeId]
		);
		await openSession(worker.userId);
		await openSession(admin.userId);
		return { tenant, worker, admin };
	}

	it('disables every user of the tenant and ends their sessions', async () => {
		const { tenant } = await staffed();
		await archiveTenant(db, tenant);

		const { rows } = await superuser.query(
			'select distinct status from app.users where tenant_id = $1',
			[tenant]
		);
		expect(rows).toEqual([{ status: 'disabled' }]);
		expect(
			await count('auth.sessions s join app.users u on u.id = s.user_id where u.tenant_id = $1', [
				tenant
			])
		).toBe(0);
	});

	it('keeps employees and time entries', async () => {
		const { tenant } = await staffed();
		await archiveTenant(db, tenant);
		expect(await count('app.employees where tenant_id = $1', [tenant])).toBe(1);
		expect(await count('app.time_entries where tenant_id = $1', [tenant])).toBe(1);
	});

	it('leaves the users of other tenants alone', async () => {
		const { tenant } = await staffed();
		const other = await staffed();
		await archiveTenant(db, tenant);
		expect(
			await count(`app.users where tenant_id = $1 and status = 'active'`, [other.tenant])
		).toBe(2);
		expect(await count('auth.sessions where user_id = $1', [other.worker.userId])).toBe(1);
	});

	it('files the archive once, a second run changes nothing', async () => {
		const { tenant } = await staffed();
		await archiveTenant(db, tenant);
		await expect(archiveTenant(db, tenant)).resolves.toBeUndefined();

		const { rows } = await superuser.query(
			`select actor_role, source, table_name, row_id
			   from audit.log where tenant_id = $1 and action = 'tenant.archived'`,
			[tenant]
		);
		expect(rows).toEqual([
			{ actor_role: 'admin', source: 'cli', table_name: 'tenants', row_id: tenant }
		]);
	});
});
