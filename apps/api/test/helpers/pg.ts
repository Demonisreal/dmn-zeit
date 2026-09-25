import { randomUUID } from 'node:crypto';
import type { Role, UserStatus, WorkspaceKind } from '@zeit/shared';
import pg from 'pg';
import { inject } from 'vitest';

export type Login = 'app' | 'owner' | 'superuser';

export type Context = {
	tenantId: string;
	userId?: string | null;
	role?: Role | null;
	employeeId?: string | null;
};

export type Account = { userId: string; context: Context };
export type Person = Account & { employeeId: string };

const users = { app: 'zeit_app', owner: 'zeit_owner', superuser: 'postgres' } as const;

let database = '';
let seeder: pg.Client | undefined;
const clients: pg.Client[] = [];

export function databaseUrl(login: Login = 'app', name = database) {
	const server = inject('pg');
	const url = new URL(`postgres://${server.host}:${server.port}/${name}`);
	url.username = users[login];
	url.password = server.passwords[login];
	return url.toString();
}

export async function openDatabase() {
	const server = inject('pg');
	database = `zeit_${randomUUID().replaceAll('-', '')}`;

	const superuser = new pg.Client(databaseUrl('superuser', 'postgres'));
	await superuser.connect();
	await superuser.query(`create database ${database} template ${server.template} owner zeit_owner`);
	// a clone keeps schemas and grants but not the database acl that 00-roles.sh set on zeit
	await superuser.query(`revoke all on database ${database} from public`);
	await superuser.query(`grant connect on database ${database} to zeit_app`);
	await superuser.end();
}

export async function closeDatabase() {
	await Promise.all(clients.splice(0).map((client) => client.end()));
	seeder = undefined;

	const superuser = new pg.Client(databaseUrl('superuser', 'postgres'));
	await superuser.connect();
	await superuser.query(`drop database ${database} with (force)`);
	await superuser.end();
}

export async function connectAs(login: Login) {
	const client = new pg.Client(databaseUrl(login));
	await client.connect();
	clients.push(client);
	return client;
}

// session-wide, unlike withTenant in the api, so the statements after it can run without a transaction
export async function withContext(client: pg.Client, context: Context) {
	await client.query(
		`select set_config('app.tenant_id', $1, false), set_config('app.user_id', $2, false),
			set_config('app.role', $3, false), set_config('app.employee_id', $4, false)`,
		[context.tenantId, context.userId ?? '', context.role ?? '', context.employeeId ?? '']
	);
	return client;
}

export async function insertId(client: pg.Client, text: string, values: unknown[] = []) {
	const { rows } = await client.query<{ id: string }>(text, values);
	return rows[0]!.id;
}

// the factories write as superuser, past rls and grants but through every trigger and constraint
async function seed() {
	seeder ??= await connectAs('superuser');
	return seeder;
}

// a solo tenant takes one person only: createPerson(tenant, { role: 'admin' }) and nobody else
export async function createTenant(
	options: { kind?: 'live' | 'sandbox'; expiresIn?: string; workspace?: WorkspaceKind } = {}
) {
	const kind = options.kind ?? 'live';
	return insertId(
		await seed(),
		`insert into app.tenants (name, slug, state, kind, expires_at, workspace)
		 values ('Steuerbüro Beispiel', $1, 'NW', $2::app.tenant_kind,
			case when $2 = 'sandbox' then now() + $3::interval end, $4)
		 returning id`,
		[
			`t-${randomUUID().slice(0, 8)}`,
			kind,
			options.expiresIn ?? '24 hours',
			options.workspace ?? 'company'
		]
	);
}

export async function createTeam(tenantId: string, name = 'Buchhaltung') {
	return insertId(
		await seed(),
		'insert into app.teams (tenant_id, name) values ($1, $2) returning id',
		[tenantId, name]
	);
}

export async function createUser(
	tenantId: string,
	options: { role?: Role; employeeId?: string | null; status?: UserStatus } = {}
): Promise<Account> {
	const role = options.role ?? 'employee';
	const employeeId = options.employeeId ?? null;
	const userId = await insertId(
		await seed(),
		`insert into app.users (tenant_id, email, display_name, role, status, employee_id)
		 values ($1, $2, 'Erika Muster', $3, $4, $5) returning id`,
		[tenantId, `${randomUUID()}@example.test`, role, options.status ?? 'active', employeeId]
	);
	return { userId, context: { tenantId, userId, role, employeeId } };
}

export async function createPerson(
	tenantId: string,
	options: { role?: Role; teamId?: string | null; leads?: string; entryDate?: string } = {}
): Promise<Person> {
	const db = await seed();
	const employeeId = await insertId(
		db,
		`insert into app.employees (tenant_id, personnel_no, first_name, last_name, team_id, entry_date)
		 values ($1, $2, 'Erika', 'Muster', $3, $4) returning id`,
		[tenantId, randomUUID().slice(0, 8), options.teamId ?? null, options.entryDate ?? '2025-01-01']
	);
	const account = await createUser(tenantId, { role: options.role ?? 'employee', employeeId });
	if (options.leads) {
		await db.query('insert into app.team_leads (tenant_id, team_id, user_id) values ($1, $2, $3)', [
			tenantId,
			options.leads,
			account.userId
		]);
	}
	return { ...account, employeeId };
}

export async function createContract(
	tenantId: string,
	employeeId: string,
	options: { validFrom?: string } = {}
) {
	return insertId(
		await seed(),
		`with model as (
			insert into app.work_models (tenant_id, name, min_mon, min_tue, min_wed, min_thu, min_fri, min_sat, min_sun)
			values ($1, 'Vollzeit 40 h', 480, 480, 480, 480, 480, 0, 0)
			returning *
		)
		insert into app.contracts (
			tenant_id, employee_id, valid_from, work_model_id,
			min_mon, min_tue, min_wed, min_thu, min_fri, min_sat, min_sun,
			vacation_days_year, vacation_basis_days
		)
		select $1, $2, coalesce($3::date, (select e.entry_date from app.employees e where e.id = $2)), m.id,
			m.min_mon, m.min_tue, m.min_wed, m.min_thu, m.min_fri, m.min_sat, m.min_sun, 30, 5
		  from model m
		returning id`,
		[tenantId, employeeId, options.validFrom ?? null]
	);
}
