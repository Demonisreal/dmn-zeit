import { reauthResultSchema, recoveryCodesSchema } from '@zeit/shared';
import { Secret, TOTP } from 'otpauth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTenant } from '../helpers/pg';
import { expectContract, PASSWORD, startApi, type Api } from './api';

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(() => api.app.close());

const appCode = (secret: string, ahead = 1) =>
	new TOTP({ secret: Secret.fromBase32(secret) }).generate({
		timestamp: Date.now() + ahead * 30_000
	});

async function signedIn(options: Parameters<Api['member']>[0] = {}) {
	const person = await api.member(options);
	const browser = api.browser();
	await browser.signIn(person.email);
	return { ...person, browser };
}

describe('step-up', () => {
	it('guards removing a factor and keeps the last one', async () => {
		const { browser, email } = await signedIn();
		const passkeyId = (await browser.get('/security')).body.passkeys[0].id as string;

		const unconfirmed = await browser.delete(`/security/passkeys/${passkeyId}`);
		expect(unconfirmed.status).toBe(403);
		expect(unconfirmed.body.code).toBe('REAUTH_REQUIRED');

		const reauth = await browser.reauth();
		expect(reauth.status).toBe(200);
		expectContract(reauthResultSchema, reauth.body);
		expect(Date.parse(reauth.body.reauthUntil)).toBeGreaterThan(Date.now() + 9 * 60_000);
		expect((await browser.get('/auth/session')).body.security.reauthUntil).toBe(
			reauth.body.reauthUntil
		);

		const last = await browser.delete(`/security/passkeys/${passkeyId}`);
		expect(last.status).toBe(409);

		const setup = await browser.post('/security/totp/setup');
		const confirmed = await browser.post('/security/totp/confirm', {
			code: appCode(setup.body.secret, 0)
		});
		expect(confirmed.body.recoveryCodes).toEqual([]);

		expect((await browser.delete(`/security/passkeys/${passkeyId}`)).status).toBe(204);
		await vi.waitFor(() =>
			expect(api.mails.some((mail) => mail.to === email && /Passkey/.test(mail.subject))).toBe(true)
		);

		const withCode = await browser.post('/auth/reauth', {
			password: PASSWORD,
			code: appCode(setup.body.secret)
		});
		expect(withCode.status).toBe(200);
	});

	it('does not take a recovery code, nor a wrong password, as confirmation', async () => {
		const { browser } = await signedIn();
		const recovery = await browser.post('/auth/reauth', {
			password: PASSWORD,
			code: 'ABCDE-FGH23'
		});
		expect(recovery.status).toBe(400);

		const wrong = await browser.post('/auth/reauth', {
			password: 'kaffee mit milch',
			code: '123456'
		});
		expect(wrong.status).toBe(403);
		expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
	});

	it('guards new recovery codes and the password change', async () => {
		const { browser } = await signedIn();
		expect((await browser.post('/security/recovery-codes')).body.code).toBe('REAUTH_REQUIRED');
		expect(
			(
				await browser.post('/auth/password/change', {
					currentPassword: PASSWORD,
					newPassword: 'ein ganz neues passwort'
				})
			).body.code
		).toBe('REAUTH_REQUIRED');

		await browser.reauth();
		const renewed = await browser.post('/security/recovery-codes');
		expect(renewed.status).toBe(200);
		expectContract(recoveryCodesSchema, renewed.body);
		expect(renewed.body.recoveryCodes).toHaveLength(10);
	});

	it('does not accept a passkey of someone else for the step-up', async () => {
		const { browser } = await signedIn();
		const stranger = await api.member();
		const options = await browser.post('/auth/reauth/passkey/options');

		const answer = await browser.post('/auth/reauth/passkey', {
			response: stranger.authenticator.assert(options.body)
		});
		expect(answer.status).toBe(403);
	});
});

describe('other sessions after a change of factors', () => {
	// the laptop makes the change, the phone stands for a session someone else might hold
	async function twoDevicesWithTotp() {
		const { browser: laptop, email } = await signedIn();
		const phone = api.browser();
		await phone.signIn(email);
		await laptop.reauth();
		const setup = await laptop.post('/security/totp/setup');
		await laptop.post('/security/totp/confirm', { code: appCode(setup.body.secret, 0) });
		expect((await phone.get('/auth/session')).status).toBe(200);
		return { laptop, phone };
	}

	it('ends them when a passkey goes, the current one stays', async () => {
		const { laptop, phone } = await twoDevicesWithTotp();
		const passkeyId = (await laptop.get('/security')).body.passkeys[0].id as string;

		expect((await laptop.delete(`/security/passkeys/${passkeyId}`)).status).toBe(204);
		expect((await phone.get('/auth/session')).status).toBe(401);
		expect((await laptop.get('/auth/session')).status).toBe(200);
	});

	it('ends them when the authenticator app goes, the current one stays', async () => {
		const { laptop, phone } = await twoDevicesWithTotp();

		expect((await laptop.delete('/security/totp')).status).toBe(204);
		expect((await phone.get('/auth/session')).status).toBe(401);
		expect((await laptop.get('/auth/session')).status).toBe(200);
	});

	it('ends them when the recovery codes are renewed, the current one stays', async () => {
		const { laptop, phone } = await twoDevicesWithTotp();

		expect((await laptop.post('/security/recovery-codes')).status).toBe(200);
		expect((await phone.get('/auth/session')).status).toBe(401);
		expect((await laptop.get('/auth/session')).status).toBe(200);
	});
});

describe('passkeys', () => {
	it('renames one of the own passkeys only', async () => {
		const { browser } = await signedIn();
		const other = await signedIn();
		const mine = (await browser.get('/security')).body.passkeys[0].id as string;
		const theirs = (await other.browser.get('/security')).body.passkeys[0].id as string;

		expect((await browser.patch(`/security/passkeys/${mine}`, { name: 'Büro' })).status).toBe(204);
		expect((await browser.get('/security')).body.passkeys[0].name).toBe('Büro');
		expect((await browser.patch(`/security/passkeys/${theirs}`, { name: 'Büro' })).status).toBe(
			404
		);
	});
});

describe('POST /api/users/:id/mfa/reset', () => {
	it('lets an admin reset someone of the own tenant, with step-up, a trail entry and a mail', async () => {
		const tenantId = await createTenant();
		const admin = await signedIn({ tenantId, role: 'admin' });
		const worker = await signedIn({ tenantId });

		const unconfirmed = await admin.browser.post(`/users/${worker.userId}/mfa/reset`);
		expect(unconfirmed.body.code).toBe('REAUTH_REQUIRED');

		await admin.browser.reauth();
		expect((await admin.browser.post(`/users/${worker.userId}/mfa/reset`)).status).toBe(204);

		expect((await worker.browser.get('/auth/session')).status).toBe(401);
		// the password went with the factors, the way back in is a reset link to the mailbox
		const stale = await api
			.browser()
			.post('/auth/login', { email: worker.email, password: PASSWORD });
		expect(stale.status).toBe(401);

		const { rows } = await api.superuser.query(
			`select actor_user_id from audit.log where action = 'mfa.reset' and row_id = $1`,
			[worker.userId]
		);
		expect(rows).toEqual([{ actor_user_id: admin.userId }]);
		await vi.waitFor(() =>
			expect(
				api.mails.some((mail) => mail.to === worker.email && /zurückgesetzt/.test(mail.subject))
			).toBe(true)
		);
	});

	it('leads the person back in through the link in the mail, with the new password only', async () => {
		const tenantId = await createTenant();
		const admin = await signedIn({ tenantId, role: 'admin' });
		const worker = await api.member({ tenantId });
		await admin.browser.reauth();
		expect((await admin.browser.post(`/users/${worker.userId}/mfa/reset`)).status).toBe(204);

		await vi.waitFor(() =>
			expect(api.mails.some((mail) => mail.to === worker.email && /reset#t=/.test(mail.text))).toBe(
				true
			)
		);
		const mail = api.mails.findLast((sent) => sent.to === worker.email)!;
		const token = mail.text.match(/\/reset#t=([\w-]{43})/)![1]!;
		const reset = await api
			.browser()
			.post('/auth/password/reset', { token, password: 'ein ganz neues passwort' });
		expect(reset.status).toBe(204);

		expect((await api.browser().signIn(worker.email)).status).toBe(401);
		const back = await api.browser().signIn(worker.email, 'ein ganz neues passwort');
		expect(back.status).toBe(200);
		expect(back.body.security.enrollmentPending).toBe(true);
	});

	it('does not reach other tenants, the own account or non-admins', async () => {
		const tenantId = await createTenant();
		const admin = await signedIn({ tenantId, role: 'admin' });
		const worker = await signedIn({ tenantId });
		const stranger = await api.member();
		await admin.browser.reauth();

		expect((await admin.browser.post(`/users/${stranger.userId}/mfa/reset`)).status).toBe(404);
		expect((await admin.browser.post(`/users/${admin.userId}/mfa/reset`)).status).toBe(403);

		const denied = await worker.browser.post(`/users/${admin.userId}/mfa/reset`);
		expect(denied.status).toBe(403);
		expect(denied.body.code).toBe('FORBIDDEN');
	});
});
