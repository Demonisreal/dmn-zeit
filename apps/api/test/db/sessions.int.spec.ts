import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectAs, createTenant, createUser, type Account } from '../helpers/pg';
import { fillTenant } from './fixtures';

let superuser: pg.Client;
let app: pg.Client;

const hash = () => randomBytes(32);

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
});

async function signIn(account: Account) {
	const token = hash();
	const { rows } = await app.query(
		`select auth.session_create($1, $2, $3, '203.0.113.7', 'vitest') as id`,
		[account.userId, token, hash()]
	);
	return { id: rows[0].id as string, token };
}

describe('session functions', () => {
	it('lists the live sessions of a user, newest first', async () => {
		const tenant = await createTenant();
		const user = await createUser(tenant);
		const older = await signIn(user);
		const newer = await signIn(user);
		await superuser.query(
			`update auth.sessions set last_seen_at = now() - interval '1 hour' where id = $1`,
			[older.id]
		);
		const expired = await signIn(user);
		await superuser.query(
			`update auth.sessions set idle_expires_at = now() - interval '1 second' where id = $1`,
			[expired.id]
		);

		const { rows } = await app.query('select id, ip, user_agent from auth.sessions_list($1)', [
			user.userId
		]);
		expect(rows).toEqual([
			{ id: newer.id, ip: '203.0.113.7', user_agent: 'vitest' },
			{ id: older.id, ip: '203.0.113.7', user_agent: 'vitest' }
		]);
	});

	it('ends a session by id only for its owner', async () => {
		const tenant = await createTenant();
		const owner = await createUser(tenant);
		const stranger = await createUser(tenant);
		const session = await signIn(owner);

		const foreign = await app.query('select auth.session_revoke_by_id($1, $2) as gone', [
			stranger.userId,
			session.id
		]);
		expect(foreign.rows[0].gone).toBe(false);

		const own = await app.query('select auth.session_revoke_by_id($1, $2) as gone', [
			owner.userId,
			session.id
		]);
		expect(own.rows[0].gone).toBe(true);
	});

	it('inspects only open and unexpired tokens', async () => {
		const tenant = await createTenant();
		const invited = await createUser(tenant);
		const token = hash();
		await app.query(`select auth.token_issue($1, 'invite', $2)`, [invited.userId, token]);

		const inspect = () =>
			app.query(`select user_id, display_name, tenant_name from auth.token_inspect($1, 'invite')`, [
				token
			]);
		expect((await inspect()).rows).toEqual([
			{ user_id: invited.userId, display_name: 'Erika Muster', tenant_name: 'Steuerbüro Beispiel' }
		]);

		const wrongKind = await app.query(`select * from auth.token_inspect($1, 'password_reset')`, [
			token
		]);
		expect(wrongKind.rows).toEqual([]);

		await app.query(`select auth.token_consume($1, 'invite')`, [token]);
		expect((await inspect()).rows).toEqual([]);
	});
});

describe('demo persona switch', () => {
	async function switchTo(session: { token: Buffer }, target: Account) {
		const { rows } = await app.query('select ops.demo_switch_persona($1, $2, $3, $4) as id', [
			session.token,
			target.userId,
			hash(),
			hash()
		]);
		return rows[0].id as string | null;
	}

	async function sessionExists(id: string) {
		const { rows } = await superuser.query('select 1 from auth.sessions where id = $1', [id]);
		return rows.length === 1;
	}

	it('swaps the session for another person of the same sandbox', async () => {
		const sandbox = await createTenant({ kind: 'sandbox' });
		const visitor = await createUser(sandbox);
		const hr = await createUser(sandbox, { role: 'hr' });
		const session = await signIn(visitor);

		const switched = await switchTo(session, hr);
		expect(switched).toEqual(expect.any(String));
		expect(switched).not.toBe(session.id);
		expect(await sessionExists(session.id)).toBe(false);

		const { rows } = await superuser.query('select user_id, ip from auth.sessions where id = $1', [
			switched
		]);
		expect(rows[0]).toEqual({ user_id: hr.userId, ip: '203.0.113.7' });
	});

	it('does nothing outside a sandbox', async () => {
		const live = await createTenant();
		const visitor = await createUser(live);
		const admin = await createUser(live, { role: 'admin' });
		const session = await signIn(visitor);

		expect(await switchTo(session, admin)).toBeNull();
		expect(await sessionExists(session.id)).toBe(true);
	});

	it('does not cross into another tenant', async () => {
		const sandbox = await createTenant({ kind: 'sandbox' });
		const other = await createTenant({ kind: 'sandbox' });
		const visitor = await createUser(sandbox);
		const stranger = await createUser(other, { role: 'admin' });
		const session = await signIn(visitor);

		expect(await switchTo(session, stranger)).toBeNull();
		expect(await sessionExists(session.id)).toBe(true);
	});

	it('does nothing once the sandbox has expired', async () => {
		const sandbox = await createTenant({ kind: 'sandbox' });
		const visitor = await createUser(sandbox);
		const hr = await createUser(sandbox, { role: 'hr' });
		const session = await signIn(visitor);
		await superuser.query(
			`update app.tenants set expires_at = now() - interval '1 minute' where id = $1`,
			[sandbox]
		);

		expect(await switchTo(session, hr)).toBeNull();
	});
});

describe('sandbox purge', () => {
	it('removes expired sandboxes down to the last row and leaves the rest alone', async () => {
		const expired = await createTenant({ kind: 'sandbox' });
		const fresh = await createTenant({ kind: 'sandbox' });
		const live = await createTenant();
		const { worker } = await fillTenant(superuser, expired);
		await fillTenant(superuser, fresh);
		await fillTenant(superuser, live);
		await signIn(worker);
		await app.query(`select auth.token_issue($1, 'password_reset', $2)`, [worker.userId, hash()]);
		await superuser.query(`select auth.password_set($1, '$argon2id$v=19$m=19456,t=2,p=1$x$y')`, [
			worker.userId
		]);
		await superuser.query(
			`update app.tenants set expires_at = now() - interval '1 minute' where id = $1`,
			[expired]
		);

		const due = await superuser.query(
			`select count(*)::int as n from app.tenants where kind = 'sandbox' and expires_at <= now()`
		);
		const { rows } = await app.query('select ops.purge_expired_sandboxes() as purged');
		expect(rows[0].purged).toBe(due.rows[0].n);

		const tables = await superuser.query<{ name: string; fence: string }>(
			`select c.table_schema || '.' || c.table_name as name,
			        case when c.table_name = 'tenants' then 'id' else c.column_name end as fence
			   from information_schema.columns c
			  where c.table_schema in ('app', 'audit', 'ops')
			    and (c.column_name = 'tenant_id' or (c.table_name = 'tenants' and c.column_name = 'id'))`
		);
		expect(tables.rows.length).toBeGreaterThan(15);
		for (const { name, fence } of tables.rows) {
			const left = await superuser.query(
				`select count(*) filter (where ${fence} = $1)::int as expired,
				        count(*) filter (where ${fence} in ($2, $3))::int as kept
				   from ${name}`,
				[expired, fresh, live]
			);
			expect(left.rows[0].expired, name).toBe(0);
			expect(left.rows[0].kept, name).toBeGreaterThan(0);
		}

		const auth = await superuser.query(
			`select (select count(*) from auth.sessions where user_id = $1)::int
			      + (select count(*) from auth.tokens where user_id = $1)::int
			      + (select count(*) from auth.credentials where user_id = $1)::int as n`,
			[worker.userId]
		);
		expect(auth.rows[0].n).toBe(0);
	});
});
