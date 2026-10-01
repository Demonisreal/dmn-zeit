import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectAs, createTenant, createUser, type Account, withContext } from '../helpers/pg';

let superuser: pg.Client;
let app: pg.Client;
let tenant: string;

const bytes = (length = 32) => randomBytes(length);
const codes = () => Array.from({ length: 10 }, () => bytes());

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
	tenant = await createTenant();
});

async function signIn(account: Account) {
	const token = bytes();
	const { rows } = await app.query(
		`select auth.session_create($1, $2, $3, '203.0.113.7', 'vitest') as id`,
		[account.userId, token, bytes()]
	);
	return { id: rows[0].id as string, token };
}

async function resolve(token: Buffer) {
	const { rows } = await app.query(
		'select session_id, reauth_at, enrollment_pending from auth.session_resolve($1)',
		[token]
	);
	return rows[0];
}

async function call<T = unknown>(text: string, values: unknown[]): Promise<T> {
	const { rows } = await app.query(text, values);
	return rows[0].result as T;
}

async function withTotp(account: Account, step = 1000) {
	await call('select auth.totp_begin($1, $2, 1) as result', [account.userId, bytes(48)]);
	await call('select auth.totp_confirm($1, $2, $3) as result', [account.userId, step, codes()]);
}

// passkey_add, totp_remove and recovery_codes_replace take the person from app.user_id
async function addPasskey(account: Account, credential = bytes()) {
	await withContext(app, account.context);
	return call<string>(
		`select auth.passkey_add($1, $2, 0, '{internal}', null, false, 'Laptop') as result`,
		[credential, bytes(77)]
	);
}

describe('enrollment', () => {
	it('opens sessions without a second factor for enrollment only', async () => {
		const fresh = await createUser(tenant);
		const persona = await createUser(tenant, { status: 'demo' });
		const enrolled = await createUser(tenant);
		await addPasskey(enrolled);

		expect((await resolve((await signIn(fresh)).token)).enrollment_pending).toBe(true);
		expect((await resolve((await signIn(persona)).token)).enrollment_pending).toBe(false);
		expect((await resolve((await signIn(enrolled)).token)).enrollment_pending).toBe(false);
	});

	it('finishes enrollment once a factor exists and drops the other half-finished sessions', async () => {
		const user = await createUser(tenant);
		const current = await signIn(user);
		const stray = await signIn(user);

		expect(await call('select auth.enrollment_finish($1) as result', [current.id])).toBe(false);
		await withTotp(user);
		expect(await call('select auth.enrollment_finish($1) as result', [current.id])).toBe(true);

		expect((await resolve(current.token)).enrollment_pending).toBe(false);
		expect(await resolve(stray.token)).toBeUndefined();
	});

	it('stamps a step-up on the session', async () => {
		const user = await createUser(tenant);
		await addPasskey(user);
		const session = await signIn(user);
		expect((await resolve(session.token)).reauth_at).toBeNull();

		await app.query('select auth.session_reauth($1)', [session.id]);
		expect((await resolve(session.token)).reauth_at).toBeInstanceOf(Date);
	});
});

describe('totp', () => {
	it('keeps a pending secret replaceable and a confirmed one fixed', async () => {
		const user = await createUser(tenant);
		const secret = () =>
			call('select auth.totp_begin($1, $2, 1) as result', [user.userId, bytes(48)]);
		expect(await secret()).toBe(true);
		expect(await secret()).toBe(true);

		const confirm = () =>
			call('select auth.totp_confirm($1, 1000, $2) as result', [user.userId, codes()]);
		expect(await confirm()).toBe(true);
		expect(await confirm()).toBe(false);
		expect(await secret()).toBe(false);

		const { rows } = await app.query('select * from auth.factors($1)', [user.userId]);
		expect(rows[0]).toEqual({ has_totp: true, passkey_count: 0, recovery_left: 10 });
	});

	it('accepts every step once and only moving forward', async () => {
		const user = await createUser(tenant);
		await withTotp(user, 1000);
		const use = (step: number) =>
			call('select auth.totp_use_step($1, $2) as result', [user.userId, step]);

		expect(await use(1000)).toBe(false);
		expect(await use(1001)).toBe(true);
		expect(await use(1001)).toBe(false);
		expect(await use(1000)).toBe(false);
		expect(await use(1002)).toBe(true);
	});

	it('lets only one of two parallel logins spend the same step', async () => {
		const user = await createUser(tenant);
		await withTotp(user, 1000);
		const second = await connectAs('app');
		const results = await Promise.all(
			[app, second].map((client) =>
				client.query('select auth.totp_use_step($1, 1001) as result', [user.userId])
			)
		);
		expect(results.map((r) => r.rows[0].result).sort()).toEqual([false, true]);
	});

	it('does not sign in with a secret that was never confirmed', async () => {
		const user = await createUser(tenant);
		await call('select auth.totp_begin($1, $2, 1) as result', [user.userId, bytes(48)]);
		expect(await call('select auth.totp_use_step($1, 5) as result', [user.userId])).toBe(false);
	});

	it('removes the secret', async () => {
		const user = await createUser(tenant);
		await withTotp(user);
		await withContext(app, user.context);
		expect(await call('select auth.totp_remove() as result', [])).toBe(true);
		const { rows } = await app.query('select * from auth.totp_secret($1)', [user.userId]);
		expect(rows).toEqual([]);
	});

	it('removes only the secret of whoever is signed in', async () => {
		const user = await createUser(tenant);
		const other = await createUser(tenant);
		await withTotp(user);
		await withContext(app, other.context);
		expect(await call('select auth.totp_remove() as result', [])).toBe(false);

		const { rows } = await app.query('select confirmed from auth.totp_secret($1)', [user.userId]);
		expect(rows).toEqual([{ confirmed: true }]);
	});
});

describe('recovery codes', () => {
	it('redeems each code once and only for its owner', async () => {
		const user = await createUser(tenant);
		const other = await createUser(tenant);
		const own = codes();
		await withContext(app, user.context);
		await app.query('select auth.recovery_codes_replace($1)', [own]);

		const use = (account: Account, code: Buffer) =>
			call('select auth.recovery_code_use($1, $2) as result', [account.userId, code]);
		expect(await use(other, own[0]!)).toBe(false);
		expect(await use(user, own[0]!)).toBe(true);
		expect(await use(user, own[0]!)).toBe(false);

		await app.query('select auth.recovery_codes_replace($1)', [codes()]);
		expect(await use(user, own[1]!)).toBe(false);
		const { rows } = await app.query('select recovery_left from auth.factors($1)', [user.userId]);
		expect(rows[0].recovery_left).toBe(10);
	});

	it('replaces only the codes of whoever is signed in, and none without a session', async () => {
		const user = await createUser(tenant);
		const other = await createUser(tenant);
		const own = codes();
		await withContext(app, user.context);
		await app.query('select auth.recovery_codes_replace($1)', [own]);

		await withContext(app, other.context);
		await app.query('select auth.recovery_codes_replace($1)', [codes()]);
		const bare = await connectAs('app');
		await expect(
			bare.query('select auth.recovery_codes_replace($1)', [codes()])
		).rejects.toMatchObject({ code: '23502' });

		expect(
			await call('select auth.recovery_code_use($1, $2) as result', [user.userId, own[0]!])
		).toBe(true);
	});

	it('drops every code hashed before the switch to hmac', async () => {
		const user = await createUser(tenant);
		await withContext(app, user.context);
		await app.query('select auth.recovery_codes_replace($1)', [codes()]);

		const migration = await readFile(
			new URL('../../../../db/migrations/20260926000970_recovery_codes_hmac.sql', import.meta.url),
			'utf8'
		);
		const owner = await connectAs('owner');
		await owner.query(migration.split('-- migrate:down')[0]!);

		const { rows } = await app.query('select recovery_left from auth.factors($1)', [user.userId]);
		expect(rows[0].recovery_left).toBe(0);
	});
});

describe('passkeys', () => {
	it('finds a passkey by credential for active accounts only', async () => {
		const user = await createUser(tenant);
		const credential = bytes();
		const id = await addPasskey(user, credential);
		const find = () =>
			app.query('select id, user_id, tenant_id, role from auth.passkey_find($1)', [credential]);
		expect((await find()).rows).toEqual([
			{ id, user_id: user.userId, tenant_id: tenant, role: 'employee' }
		]);

		await superuser.query(`update app.users set status = 'disabled' where id = $1`, [user.userId]);
		expect((await find()).rows).toEqual([]);
	});

	it('adds a passkey only for a signed-in person', async () => {
		await withContext(app, { tenantId: tenant });
		await expect(
			app.query(`select auth.passkey_add($1, $2, 0, '{internal}', null, false, 'Laptop')`, [
				bytes(),
				bytes(77)
			])
		).rejects.toMatchObject({ code: '23502' });
	});

	it('registers a credential only once', async () => {
		const user = await createUser(tenant);
		const credential = bytes();
		await addPasskey(user, credential);
		await expect(addPasskey(await createUser(tenant), credential)).rejects.toMatchObject({
			code: '23505'
		});
	});

	it('accepts a signature counter only when it moves forward', async () => {
		const user = await createUser(tenant);
		const id = await addPasskey(user);
		const touch = (counter: number) =>
			call('select auth.passkey_touch($1, $2, true) as result', [id, counter]);

		expect(await touch(5)).toBe(true);
		expect(await touch(5)).toBe(false);
		expect(await touch(3)).toBe(false);
		expect(await touch(6)).toBe(true);
	});

	it('lets authenticators without a counter stay at zero', async () => {
		const user = await createUser(tenant);
		const id = await addPasskey(user);
		const touch = () => call('select auth.passkey_touch($1, 0, false) as result', [id]);
		expect(await touch()).toBe(true);
		expect(await touch()).toBe(true);
	});

	it('lists the credential ids for excludeCredentials', async () => {
		const user = await createUser(tenant);
		const credential = bytes();
		await addPasskey(user, credential);
		const { rows } = await app.query('select credential_id from auth.passkeys_list($1)', [
			user.userId
		]);
		expect(rows).toEqual([{ credential_id: credential }]);
	});

	it('renames and removes only passkeys of their owner', async () => {
		const user = await createUser(tenant);
		const other = await createUser(tenant);
		const id = await addPasskey(user);

		const rename = (account: Account) =>
			call(`select auth.passkey_rename($1, $2, 'Telefon') as result`, [account.userId, id]);
		const remove = (account: Account) =>
			call('select auth.passkey_remove($1, $2) as result', [account.userId, id]);
		expect(await rename(other)).toBe(false);
		expect(await remove(other)).toBe(false);
		expect(await rename(user)).toBe(true);

		const { rows } = await app.query('select name from auth.passkeys_list($1)', [user.userId]);
		expect(rows).toEqual([{ name: 'Telefon' }]);
		expect(await remove(user)).toBe(true);
	});
});

describe('webauthn challenges', () => {
	const create = (challenge: Buffer, purpose: string, userId: string | null) =>
		app.query('select auth.webauthn_challenge_create($1, $2, $3)', [challenge, purpose, userId]);
	const consume = (challenge: Buffer, purpose: string, userId: string | null) =>
		call('select auth.webauthn_challenge_consume($1, $2, $3) as result', [
			challenge,
			purpose,
			userId
		]);

	it('spends a challenge once, for its purpose and person', async () => {
		const user = await createUser(tenant);
		const challenge = bytes();
		await create(challenge, 'register', user.userId);

		expect(await consume(challenge, 'reauth', user.userId)).toBe(false);
		expect(await consume(challenge, 'register', null)).toBe(false);
		expect(await consume(challenge, 'register', user.userId)).toBe(true);
		expect(await consume(challenge, 'register', user.userId)).toBe(false);
	});

	it('knows nobody on a login challenge and lets it expire', async () => {
		const user = await createUser(tenant);
		await expect(create(bytes(), 'login', user.userId)).rejects.toMatchObject({ code: '23514' });

		const challenge = bytes();
		await create(challenge, 'login', null);
		await superuser.query(
			`update auth.webauthn_challenges set expires_at = now() - interval '1 second' where challenge = $1`,
			[challenge]
		);
		expect(await consume(challenge, 'login', null)).toBe(false);
	});
});

describe('mfa challenges', () => {
	it('counts at most five attempts', async () => {
		const user = await createUser(tenant);
		const token = bytes();
		await app.query('select auth.mfa_challenge_create($1, $2)', [user.userId, token]);

		const attempt = () => call('select auth.mfa_challenge_attempt($1) as result', [token]);
		for (let i = 0; i < 5; i++) expect(await attempt()).toBe(user.userId);
		expect(await attempt()).toBeNull();
	});

	it('names tenant and role with the attempt and shares the count with the short form', async () => {
		const user = await createUser(tenant, { role: 'hr' });
		const token = bytes();
		await app.query('select auth.mfa_challenge_create($1, $2)', [user.userId, token]);
		const scoped = () =>
			app.query('select * from auth.mfa_challenge_attempt_with_scope($1)', [token]);

		expect((await scoped()).rows).toEqual([
			{ user_id: user.userId, tenant_id: tenant, role: 'hr' }
		]);
		for (let i = 0; i < 4; i++) {
			expect(await call('select auth.mfa_challenge_attempt($1) as result', [token])).toBe(
				user.userId
			);
		}
		expect((await scoped()).rows).toEqual([]);
	});

	it('stops the second step once misses have locked the account', async () => {
		const user = await createUser(tenant);
		await superuser.query(`select auth.password_set($1, '$argon2id$v=19$m=19456,t=2,p=1$eA$eQ')`, [
			user.userId
		]);
		const token = bytes();
		await app.query('select auth.mfa_challenge_create($1, $2)', [user.userId, token]);
		const attempt = () => call('select auth.mfa_challenge_attempt($1) as result', [token]);

		expect(await attempt()).toBe(user.userId);
		// the api reports every wrong code, a fresh password login would otherwise bring five new tries
		for (let miss = 0; miss < 5; miss++)
			await app.query('select auth.login_failed($1)', [user.userId]);
		expect(await attempt()).toBeNull();
	});

	it('redeems a challenge once', async () => {
		const user = await createUser(tenant);
		const token = bytes();
		await app.query('select auth.mfa_challenge_create($1, $2)', [user.userId, token]);

		const consume = () => call('select auth.mfa_challenge_consume($1) as result', [token]);
		expect(await consume()).toBe(user.userId);
		expect(await consume()).toBeNull();
	});

	it('replaces the open step on a new password login and forgets it after five minutes', async () => {
		const user = await createUser(tenant);
		const first = bytes();
		const second = bytes();
		await app.query('select auth.mfa_challenge_create($1, $2)', [user.userId, first]);
		await app.query('select auth.mfa_challenge_create($1, $2)', [user.userId, second]);
		expect(await call('select auth.mfa_challenge_attempt($1) as result', [first])).toBeNull();

		await superuser.query(
			`update auth.mfa_challenges set expires_at = now() - interval '1 second' where token_hash = $1`,
			[second]
		);
		expect(await call('select auth.mfa_challenge_attempt($1) as result', [second])).toBeNull();
		await app.query('select auth.purge_expired()');
		const { rows } = await superuser.query(
			'select count(*)::int as n from auth.mfa_challenges where user_id = $1',
			[user.userId]
		);
		expect(rows[0].n).toBe(0);
	});
});

describe('second factor reset', () => {
	async function factorsOf(account: Account) {
		const { rows } = await app.query('select * from auth.factors($1)', [account.userId]);
		return rows[0];
	}

	it('lets an admin of the same tenant wipe the factors and sessions of someone else', async () => {
		const admin = await createUser(tenant, { role: 'admin' });
		const user = await createUser(tenant);
		await withTotp(user);
		await addPasskey(user);
		await signIn(user);

		await withContext(app, admin.context);
		await app.query('select auth.mfa_reset($1)', [user.userId]);

		expect(await factorsOf(user)).toEqual({ has_totp: false, passkey_count: 0, recovery_left: 0 });
		const { rows } = await superuser.query(
			'select count(*)::int as n from auth.sessions where user_id = $1',
			[user.userId]
		);
		expect(rows[0].n).toBe(0);
	});

	it('takes the password along, only a reset link from the mailbox leads back in', async () => {
		const admin = await createUser(tenant, { role: 'admin' });
		const user = await createUser(tenant);
		await superuser.query(`select auth.password_set($1, '$argon2id$v=19$m=19456,t=2,p=1$eA$eQ')`, [
			user.userId
		]);
		await withTotp(user);

		await withContext(app, admin.context);
		await app.query('select auth.mfa_reset($1)', [user.userId]);
		const passwords = () =>
			superuser.query('select password_hash from auth.credentials where user_id = $1', [
				user.userId
			]);
		expect((await passwords()).rows).toEqual([]);

		const token = bytes();
		await app.query(`select auth.token_issue($1, 'password_reset', $2)`, [user.userId, token]);
		const reset = await call(
			`select auth.password_reset($1, '$argon2id$v=19$m=19456,t=2,p=1$bmV1$bmV1') as result`,
			[token]
		);
		expect(reset).toBe(user.userId);
		expect((await passwords()).rows).toEqual([
			{ password_hash: '$argon2id$v=19$m=19456,t=2,p=1$bmV1$bmV1' }
		]);
	});

	it('refuses hr, admins of another tenant and admins on themselves', async () => {
		const user = await createUser(tenant);
		await withTotp(user);
		const hr = await createUser(tenant, { role: 'hr' });
		const foreignAdmin = await createUser(await createTenant(), { role: 'admin' });
		const admin = await createUser(tenant, { role: 'admin' });

		for (const [actor, target] of [
			[hr, user],
			[foreignAdmin, user],
			[admin, admin]
		] as const) {
			await withContext(app, actor.context);
			await expect(app.query('select auth.mfa_reset($1)', [target.userId])).rejects.toMatchObject({
				code: '42501'
			});
		}
		expect((await factorsOf(user)).has_totp).toBe(true);
	});
});

describe('functions that take the person from the session', () => {
	// the signatures before 20260926000920 let any zeit_app caller name someone else
	it('no longer accept a user id from zeit_app', async () => {
		const victim = await createUser(tenant);
		for (const [text, values] of [
			[
				`select auth.passkey_add($1::uuid, $2, $3, 0, '{internal}', null, false, 'Laptop')`,
				[victim.userId, bytes(), bytes(77)]
			],
			['select auth.totp_remove($1::uuid)', [victim.userId]],
			['select auth.recovery_codes_replace($1::uuid, $2)', [victim.userId, codes()]]
		] as const) {
			await expect(app.query(text, [...values])).rejects.toMatchObject({ code: '42883' });
		}
	});
});

describe('storage', () => {
	it('gives zeit_app no access to the factor tables', async () => {
		for (const table of [
			'auth.totp',
			'auth.recovery_codes',
			'auth.passkeys',
			'auth.webauthn_challenges',
			'auth.mfa_challenges'
		]) {
			await expect(app.query(`select 1 from ${table}`)).rejects.toMatchObject({ code: '42501' });
		}
	});
});
