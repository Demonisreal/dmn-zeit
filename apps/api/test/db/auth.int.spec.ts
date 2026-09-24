import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectAs, createTenant, createUser, type Account, withContext } from '../helpers/pg';

let superuser: pg.Client;
let app: pg.Client;
let tenant: string;

const hash = () => randomBytes(32);
const oldHash = '$argon2id$v=19$m=19456,t=2,p=1$b2xk$b2xk';
const newHash = '$argon2id$v=19$m=19456,t=2,p=1$bmV1$bmV1';

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
	tenant = await createTenant();
});

async function signIn(account: Account) {
	const { rows } = await app.query(
		`select auth.session_create($1, $2, $3, '203.0.113.7', 'vitest') as id`,
		[account.userId, hash(), hash()]
	);
	return rows[0].id as string;
}

async function withPassword(account: Account) {
	await superuser.query('select auth.password_set($1, $2)', [account.userId, oldHash]);
}

async function sessionCount(account: Account) {
	const { rows } = await superuser.query(
		'select count(*)::int as n from auth.sessions where user_id = $1',
		[account.userId]
	);
	return rows[0].n;
}

async function credentials(account: Account) {
	const { rows } = await superuser.query(
		`select password_hash, failed_count, locked_until > now() as locked
		   from auth.credentials where user_id = $1`,
		[account.userId]
	);
	return rows[0];
}

describe('tokens', () => {
	it('keeps an invitation for 7 days and a reset link for 30 minutes', async () => {
		const user = await createUser(tenant);
		const { rows } = await app.query(
			`select extract(epoch from auth.token_issue($1, 'invite', $2) - now())::int as invite,
			        extract(epoch from auth.token_issue($1, 'password_reset', $3) - now())::int as reset`,
			[user.userId, hash(), hash()]
		);
		expect(rows[0]).toEqual({ invite: 7 * 24 * 3600, reset: 30 * 60 });
	});

	it('accepts an invitation once and activates the account', async () => {
		const invited = await createUser(tenant, { status: 'invited' });
		const token = hash();
		await app.query(`select auth.token_issue($1, 'invite', $2)`, [invited.userId, token]);

		const accept = () => app.query('select auth.invitation_accept($1, $2) as id', [token, newHash]);
		expect((await accept()).rows[0].id).toBe(invited.userId);
		expect((await accept()).rows[0].id).toBeNull();

		const { rows } = await superuser.query('select status from app.users where id = $1', [
			invited.userId
		]);
		expect(rows[0].status).toBe('active');
		expect((await credentials(invited)).password_hash).toBe(newHash);
	});

	it('ignores an invitation for someone who is no longer invited', async () => {
		const disabled = await createUser(tenant, { status: 'disabled' });
		const token = hash();
		await app.query(`select auth.token_issue($1, 'invite', $2)`, [disabled.userId, token]);
		const { rows } = await app.query('select auth.invitation_accept($1, $2) as id', [
			token,
			newHash
		]);
		expect(rows[0].id).toBeNull();
	});

	it('resets a password once, lifts the lock and signs the person out everywhere', async () => {
		const user = await createUser(tenant);
		await withPassword(user);
		await signIn(user);
		await superuser.query(
			`update auth.credentials set failed_count = 7, locked_until = now() + interval '1 hour'
			  where user_id = $1`,
			[user.userId]
		);
		const token = hash();
		await app.query(`select auth.token_issue($1, 'password_reset', $2)`, [user.userId, token]);

		const reset = () => app.query('select auth.password_reset($1, $2) as id', [token, newHash]);
		expect((await reset()).rows[0].id).toBe(user.userId);
		expect((await reset()).rows[0].id).toBeNull();

		expect(await sessionCount(user)).toBe(0);
		expect(await credentials(user)).toEqual({
			password_hash: newHash,
			failed_count: 0,
			locked: null
		});
	});

	it('does not take an invitation as a reset link', async () => {
		const user = await createUser(tenant);
		const token = hash();
		await app.query(`select auth.token_issue($1, 'invite', $2)`, [user.userId, token]);
		const { rows } = await app.query('select auth.password_reset($1, $2) as id', [token, newHash]);
		expect(rows[0].id).toBeNull();
	});

	it('names the invited person as the one who activated the account', async () => {
		const invited = await createUser(tenant, { status: 'invited', role: 'team_lead' });
		const requester = await createUser(tenant, { role: 'admin' });
		const token = hash();
		await app.query(`select auth.token_issue($1, 'invite', $2)`, [invited.userId, token]);

		const client = await withContext(await connectAs('app'), requester.context);
		await client.query('begin');
		await client.query('select auth.invitation_accept($1, $2)', [token, newHash]);
		const { rows: after } = await client.query(
			`select current_setting('app.user_id') as user_id, current_setting('app.role') as role`
		);
		await client.query('commit');
		expect(after[0]).toEqual({ user_id: requester.userId, role: 'admin' });

		const { rows } = await superuser.query(
			`select actor_user_id, actor_role, diff
			   from audit.log
			  where table_name = 'users' and row_id = $1 and action = 'update'`,
			[invited.userId]
		);
		expect(rows).toEqual([
			{
				actor_user_id: invited.userId,
				actor_role: 'team_lead',
				diff: { status: ['invited', 'active'] }
			}
		]);
	});
});

describe('passwords', () => {
	it('changes the password of the signed-in person and ends all their sessions', async () => {
		const user = await createUser(tenant);
		const bystander = await createUser(tenant);
		await withPassword(user);
		await signIn(user);
		await signIn(user);
		await signIn(bystander);

		await withContext(app, user.context);
		await app.query('select auth.password_change($1)', [newHash]);

		expect((await credentials(user)).password_hash).toBe(newHash);
		expect(await sessionCount(user)).toBe(0);
		expect(await sessionCount(bystander)).toBe(1);
	});

	it('needs a signed-in person to change a password', async () => {
		const bare = await connectAs('app');
		await expect(bare.query('select auth.password_change($1)', [newHash])).rejects.toMatchObject({
			code: '28000'
		});
	});

	it('swaps a hash only while the old one is still stored and keeps the sessions', async () => {
		const user = await createUser(tenant);
		await withPassword(user);
		await signIn(user);
		const rehash = (from: string, to: string) =>
			app.query('select auth.password_rehash($1, $2, $3) as swapped', [user.userId, from, to]);

		expect((await rehash(oldHash, newHash)).rows[0].swapped).toBe(true);
		expect((await rehash(oldHash, `${newHash}x`)).rows[0].swapped).toBe(false);
		expect((await credentials(user)).password_hash).toBe(newHash);
		expect(await sessionCount(user)).toBe(1);
	});

	it('rehashes into argon2id only', async () => {
		const user = await createUser(tenant);
		await withPassword(user);
		await expect(
			app.query('select auth.password_rehash($1, $2, $3)', [
				user.userId,
				oldHash,
				'$2b$12$abcdefghijklmnopqrstuv'
			])
		).rejects.toMatchObject({ code: '23514' });
	});

	it('keeps auth.password_set out of reach of zeit_app', async () => {
		const user = await createUser(tenant);
		await expect(
			app.query('select auth.password_set($1, $2)', [user.userId, newHash])
		).rejects.toMatchObject({ code: '42501' });
	});
});

describe('login', () => {
	it('looks up active accounts only', async () => {
		const active = await createUser(tenant);
		const invited = await createUser(tenant, { status: 'invited' });
		const emails = await superuser.query(
			'select email::text from app.users where id = any ($1) order by status',
			[[active.userId, invited.userId]]
		);
		const found = [];
		for (const { email } of emails.rows) {
			const { rows } = await app.query('select user_id from auth.login_lookup($1)', [email]);
			found.push(...rows);
		}
		expect(found).toEqual([{ user_id: active.userId }]);
	});

	it('refuses a session while the account is locked and leaves the lock in place', async () => {
		const user = await createUser(tenant);
		await withPassword(user);
		await superuser.query(
			`update auth.credentials set failed_count = 5, locked_until = now() + interval '1 minute'
			  where user_id = $1`,
			[user.userId]
		);
		await expect(signIn(user)).rejects.toMatchObject({ code: '28000' });
		expect(await credentials(user)).toMatchObject({ failed_count: 5, locked: true });
	});

	it('locks from the fifth miss in a row', async () => {
		const user = await createUser(tenant);
		await withPassword(user);
		for (let miss = 1; miss <= 4; miss++) {
			const { rows } = await app.query('select auth.login_failed($1) as until', [user.userId]);
			expect(rows[0].until).toBeNull();
		}
		const { rows } = await app.query(
			`select extract(epoch from auth.login_failed($1) - now())::int as seconds`,
			[user.userId]
		);
		expect(rows[0].seconds).toBe(60);
	});

	it('starts a new streak after a day without misses', async () => {
		const user = await createUser(tenant);
		await withPassword(user);
		await superuser.query(
			`update auth.credentials set failed_count = 4, last_failed_at = now() - interval '25 hours'
			  where user_id = $1`,
			[user.userId]
		);
		const { rows } = await app.query('select auth.login_failed($1) as until', [user.userId]);
		expect(rows[0].until).toBeNull();
		expect((await credentials(user)).failed_count).toBe(1);
	});
});
