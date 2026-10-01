import { createHash } from 'node:crypto';
import {
	mfaChallengeSchema,
	passkeyCreatedSchema,
	recoveryCodesSchema,
	securityOverviewSchema,
	sessionSchema,
	totpSetupSchema
} from '@zeit/shared';
import { Secret, TOTP } from 'otpauth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cookieFrom, expectContract, PASSWORD, startApi, type Api } from './api';
import { SoftAuthenticator } from './authenticator';

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(() => api.app.close());

// what the authenticator app shows; ahead by one step, so the code is fresh after the confirmation
function appCode(secret: string, ahead = 1) {
	return new TOTP({ secret: Secret.fromBase32(secret) }).generate({
		timestamp: Date.now() + ahead * 30_000
	});
}

async function actions(userId: string) {
	const { rows } = await api.superuser.query<{ action: string; diff: { method?: string } | null }>(
		`select action, diff from audit.log where source = 'app' and row_id = $1 order by id`,
		[userId]
	);
	return rows.map((row) => (row.diff?.method ? `${row.action}:${row.diff.method}` : row.action));
}

// invitation accepted, authenticator app confirmed: the way every live account starts
async function enrolWithTotp() {
	const { token, email, userId } = await api.invited();
	const browser = api.browser();
	browser.remember(await browser.post('/auth/invitations/accept', { token, password: PASSWORD }));

	const setup = await browser.post('/security/totp/setup');
	const secret = setup.body.secret as string;
	const confirmed = await browser.post('/security/totp/confirm', { code: appCode(secret, 0) });
	return {
		browser,
		email,
		userId,
		secret,
		recoveryCodes: confirmed.body.recoveryCodes as string[]
	};
}

async function passwordStep(email: string) {
	const browser = api.browser();
	const answer = await browser.post('/auth/login', { email, password: PASSWORD });
	browser.remember(answer);
	return { browser, answer };
}

describe('setting up the second factor', () => {
	it('walks from the invitation through the setup to a login with password and code', async () => {
		const { token, email, userId } = await api.invited();
		const browser = api.browser();

		const accepted = await browser.post('/auth/invitations/accept', { token, password: PASSWORD });
		browser.remember(accepted);
		expectContract(sessionSchema, accepted.body);
		expect(accepted.body.security.enrollmentPending).toBe(true);

		const blocked = await browser.get('/auth/sessions');
		expect(blocked.status).toBe(403);
		expect(blocked.body.code).toBe('MFA_ENROLLMENT_REQUIRED');
		const overview = await browser.get('/security');
		expectContract(securityOverviewSchema, overview.body);
		expect(overview.body).toMatchObject({ hasTotp: false, passkeys: [], recoveryCodesLeft: 0 });

		const setup = await browser.post('/security/totp/setup');
		expect(setup.status).toBe(200);
		expectContract(totpSetupSchema, setup.body);
		expect(setup.body.otpauthUri).toContain(encodeURIComponent(email));

		const wrong = await browser.post('/security/totp/confirm', { code: '000000' });
		expect(wrong.status).toBe(400);

		const confirmed = await browser.post('/security/totp/confirm', {
			code: appCode(setup.body.secret, 0)
		});
		expect(confirmed.status).toBe(200);
		expectContract(recoveryCodesSchema, confirmed.body);
		expect(confirmed.body.recoveryCodes).toHaveLength(10);
		expect(JSON.stringify((await browser.get('/security')).body)).not.toContain(setup.body.secret);
		expect((await browser.get('/auth/session')).body.security.enrollmentPending).toBe(false);
		expect((await browser.get('/auth/sessions')).status).toBe(200);
		await vi.waitFor(() =>
			expect(
				api.mails.some((mail) => mail.to === email && /Authenticator/.test(mail.subject))
			).toBe(true)
		);

		expect((await browser.post('/auth/logout')).status).toBe(204);

		const { browser: next, answer } = await passwordStep(email);
		expect(answer.status).toBe(200);
		expectContract(mfaChallengeSchema, answer.body);
		expect(answer.body).toEqual({ mfaRequired: true, methods: ['totp', 'recovery'] });
		expect(cookieFrom(answer, 'zeit_mfa')).toMatch(
			/^zeit_mfa=[\w-]{43}; Max-Age=300; Path=\/; Expires=[^;]+; HttpOnly; SameSite=Strict$/
		);
		expect(cookieFrom(answer, 'zeit_sid')).toBeUndefined();

		const session = await next.post('/auth/mfa/totp', { code: appCode(setup.body.secret) });
		expect(session.status).toBe(200);
		expectContract(sessionSchema, session.body);
		expect(session.body.security.enrollmentPending).toBe(false);
		expect(cookieFrom(session, 'zeit_mfa')).toMatch(
			/^zeit_mfa=; Path=\/; Expires=Thu, 01 Jan 1970/
		);

		expect(await actions(userId)).toEqual(
			expect.arrayContaining(['totp.enabled', 'login.succeeded:totp'])
		);
	});

	it('sets up a passkey as first factor and signs in with it alone', async () => {
		const { token, userId } = await api.invited();
		const browser = api.browser();
		browser.remember(await browser.post('/auth/invitations/accept', { token, password: PASSWORD }));
		const authenticator = new SoftAuthenticator('http://localhost:5173', userId);

		const options = await browser.post('/security/passkeys/options');
		expect(options.body).toMatchObject({
			rp: { id: 'localhost', name: 'DMN Zeit' },
			authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
			attestation: 'none'
		});

		const created = await browser.post('/security/passkeys', {
			response: authenticator.attest(options.body),
			name: 'Laptop'
		});
		expect(created.status).toBe(201);
		expectContract(passkeyCreatedSchema, created.body);
		expect(created.body.passkey).toMatchObject({ name: 'Laptop', backedUp: false });
		expect(created.body.recoveryCodes).toHaveLength(10);
		expect((await browser.get('/auth/session')).body.security.enrollmentPending).toBe(false);

		const again = await browser.post('/security/passkeys', {
			response: authenticator.attest(options.body),
			name: 'Laptop'
		});
		expect(again.status).toBe(403);
		expect(again.body.code).toBe('REAUTH_REQUIRED');

		const next = await browser.post('/security/passkeys/options');
		expect(next.body.excludeCredentials).toEqual([
			{
				id: authenticator.credentialId.toString('base64url'),
				type: 'public-key',
				transports: ['internal']
			}
		]);

		const login = api.browser();
		const loginOptions = await login.post('/auth/passkey/options');
		expect(loginOptions.body.allowCredentials ?? []).toEqual([]);
		const session = await login.post('/auth/passkey/verify', {
			response: authenticator.assert(loginOptions.body)
		});
		expect(session.status).toBe(200);
		expectContract(sessionSchema, session.body);
		expect(session.body.user.id).toBe(userId);
	});

	it('refuses a passkey whose counter does not move forward and files it in the trail', async () => {
		const { authenticator, userId } = await api.member();
		const browser = api.browser();
		const sign = async () => {
			const options = await browser.post('/auth/passkey/options');
			return browser.post('/auth/passkey/verify', { response: authenticator.assert(options.body) });
		};

		expect((await sign()).status).toBe(200);
		authenticator.counter = 0;
		const cloned = await sign();
		expect(cloned.status).toBe(401);
		expect(cloned.body.code).toBe('INVALID_CREDENTIALS');
		expect(await actions(userId)).toContain('passkey.counter_rejected');
	});

	it('files a passkey signature that does not hold as failed login', async () => {
		const { authenticator, userId } = await api.member();
		const browser = api.browser();
		await browser.post('/auth/passkey/options');

		const forged = await browser.post('/auth/passkey/verify', {
			response: authenticator.assert({ challenge: Buffer.alloc(32, 7).toString('base64url') })
		});
		expect(forged.status).toBe(401);
		expect(await actions(userId)).toContain('login.failed:passkey');
	});

	it('does not reuse the challenge of a passkey login', async () => {
		const { authenticator } = await api.member();
		const browser = api.browser();
		const options = await browser.post('/auth/passkey/options');

		expect(
			(await browser.post('/auth/passkey/verify', { response: authenticator.assert(options.body) }))
				.status
		).toBe(200);
		expect(
			(await browser.post('/auth/passkey/verify', { response: authenticator.assert(options.body) }))
				.status
		).toBe(401);
	});

	it('lets a passkey past a lock that guessed passwords ran up, and leaves the lock', async () => {
		const { authenticator, email, userId } = await api.member();
		await api.superuser.query(
			`update auth.credentials set failed_count = 5, locked_until = now() + interval '1 minute'
			  where user_id = $1`,
			[userId]
		);
		expect((await api.browser().signIn(email)).status).toBe(401);

		const browser = api.browser();
		const options = await browser.post('/auth/passkey/options');
		const session = await browser.post('/auth/passkey/verify', {
			response: authenticator.assert(options.body)
		});
		expect(session.status).toBe(200);
		expect(session.body.user.id).toBe(userId);

		const { rows } = await api.superuser.query(
			'select failed_count, locked_until > now() as locked from auth.credentials where user_id = $1',
			[userId]
		);
		expect(rows[0]).toEqual({ failed_count: 5, locked: true });
	});
});

describe('the second step of a password login', () => {
	it('takes a code only once', async () => {
		const { email, secret, browser } = await enrolWithTotp();
		await browser.post('/auth/logout');
		const code = appCode(secret);

		const first = await passwordStep(email);
		expect((await first.browser.post('/auth/mfa/totp', { code })).status).toBe(200);

		const second = await passwordStep(email);
		const replayed = await second.browser.post('/auth/mfa/totp', { code });
		expect(replayed.status).toBe(401);
		expect(replayed.body.code).toBe('INVALID_CREDENTIALS');
	});

	it('ends the step after five wrong codes, and each one counts towards the lock', async () => {
		const { email, secret, userId } = await enrolWithTotp();
		const { browser } = await passwordStep(email);

		for (let i = 0; i < 5; i++) {
			const wrong = await browser.post('/auth/mfa/totp', { code: '000000' });
			expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
		}
		const late = await browser.post('/auth/mfa/totp', { code: appCode(secret) });
		expect(late.status).toBe(401);
		expect(late.body.code).toBe('UNAUTHENTICATED');

		const { rows } = await api.superuser.query(
			'select failed_count, locked_until > now() as locked from auth.credentials where user_id = $1',
			[userId]
		);
		expect(rows[0]).toEqual({ failed_count: 5, locked: true });
		expect((await actions(userId)).filter((action) => action === 'login.failed:totp')).toHaveLength(
			5
		);
	});

	it('takes a recovery code once, however it is typed', async () => {
		const { email, recoveryCodes } = await enrolWithTotp();
		const code = recoveryCodes[0]!.toLowerCase().replace('-', ' ');

		const first = await passwordStep(email);
		expect((await first.browser.post('/auth/mfa/recovery', { code })).status).toBe(200);

		const second = await passwordStep(email);
		expect((await second.browser.post('/auth/mfa/recovery', { code })).status).toBe(401);
	});

	it('mails the person about a sign-in with a recovery code', async () => {
		const { email, recoveryCodes } = await enrolWithTotp();
		const { browser } = await passwordStep(email);

		expect((await browser.post('/auth/mfa/recovery', { code: recoveryCodes[0] })).status).toBe(200);
		await vi.waitFor(() =>
			expect(
				api.mails.some((mail) => mail.to === email && /Wiederherstellungscode/.test(mail.subject))
			).toBe(true)
		);
	});

	it('no longer takes a code stored as plain sha-256, only the hmac ones', async () => {
		const { email, userId, recoveryCodes } = await enrolWithTotp();
		// a row as the api wrote it before 20260926000970, in case one survived the migration
		await api.superuser.query(
			'insert into auth.recovery_codes (user_id, code_hash) values ($1, $2)',
			[userId, createHash('sha256').update('ABCDEFGH23').digest()]
		);

		const legacy = await passwordStep(email);
		expect((await legacy.browser.post('/auth/mfa/recovery', { code: 'ABCDE-FGH23' })).status).toBe(
			401
		);

		const current = await passwordStep(email);
		expect(
			(await current.browser.post('/auth/mfa/recovery', { code: recoveryCodes[0] })).status
		).toBe(200);
	});

	it('answers without a pending step as expired', async () => {
		const answer = await api.browser().post('/auth/mfa/totp', { code: '123456' });
		expect(answer.status).toBe(401);
		expect(answer.body.code).toBe('UNAUTHENTICATED');
	});

	it('allows 60 tries a minute from one address', async () => {
		const browser = api.browser();
		for (let i = 0; i < 60; i++) {
			expect((await browser.post('/auth/mfa/totp', { code: '123456' })).status).toBe(401);
		}
		const blocked = await browser.post('/auth/mfa/totp', { code: '123456' });
		expect(blocked.status).toBe(429);
		expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
	});

	it('stops a whole /24 after 200 tries in a quarter hour, the next network goes on', async () => {
		await Promise.all(
			Array.from({ length: 20 }, async (_, host) => {
				const browser = api.browser(`198.51.100.${host + 1}`);
				for (let i = 0; i < 10; i++) {
					expect((await browser.post('/auth/mfa/totp', { code: '123456' })).status).toBe(401);
				}
			})
		);

		const code = { code: '123456' };
		const blocked = await api.browser('198.51.100.21').post('/auth/mfa/totp', code);
		expect(blocked.status).toBe(429);
		expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
		expect((await api.browser('198.51.101.1').post('/auth/mfa/totp', code)).status).toBe(401);
	});
});
