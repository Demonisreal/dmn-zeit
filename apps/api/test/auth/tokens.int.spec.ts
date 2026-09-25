import { randomUUID } from 'node:crypto';
import { invitationSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTenant } from '../../src/cli/tenant-create';
import { Database } from '../../src/db/database';
import { databaseUrl } from '../helpers/pg';
import { expectContract, startApi, type Api } from './api';

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(() => api.app.close());

async function resetToken(email: string) {
	await vi.waitFor(() => expect(api.mails.some((mail) => mail.to === email)).toBe(true));
	const mail = api.mails.findLast((sent) => sent.to === email)!;
	return mail.text.match(/\/reset#t=([\w-]{43})/)![1]!;
}

describe('invitations', () => {
	it('shows who is invited and can be accepted exactly once', async () => {
		const { token, email } = await api.invited();
		const browser = api.browser();

		const inspected = await browser.post('/auth/invitations/inspect', { token });
		expect(inspected.status).toBe(200);
		expectContract(invitationSchema, inspected.body);
		expect(inspected.body).toEqual({
			email,
			displayName: 'Erika Muster',
			tenantName: 'Steuerbüro Beispiel'
		});

		const accept = () =>
			browser.post('/auth/invitations/accept', { token, password: 'mein eigenes passwort' });
		const accepted = await accept();
		expect(accepted.status).toBe(200);
		expect(accepted.body.security).toEqual({ enrollmentPending: true, reauthUntil: null });

		const again = await accept();
		expect(again.status).toBe(400);
		expect(again.body.code).toBe('TOKEN_INVALID');
		expect((await browser.post('/auth/invitations/inspect', { token })).status).toBe(400);

		expect((await api.browser().signIn(email, 'mein eigenes passwort')).status).toBe(200);
	});

	it('takes the link the cli hands out for a new tenant', async () => {
		const db = new Database(databaseUrl('owner'));
		const email = `${randomUUID()}@example.test`;
		const link = await createTenant(
			db,
			{
				name: 'Steuerbüro Neu',
				slug: `neu-${randomUUID().slice(0, 8)}`,
				state: 'NW',
				adminEmail: email,
				adminName: 'Anna Admin'
			},
			'http://localhost:5173'
		).finally(() => db.destroy());

		const token = link.match(/^http:\/\/localhost:5173\/invite#t=([\w-]{43})$/)![1]!;
		const browser = api.browser();
		expect((await browser.post('/auth/invitations/inspect', { token })).body).toEqual({
			email,
			displayName: 'Anna Admin',
			tenantName: 'Steuerbüro Neu'
		});
		expect(
			(await browser.post('/auth/invitations/accept', { token, password: 'mein eigenes passwort' }))
				.status
		).toBe(200);

		const admin = await api.browser().signIn(email, 'mein eigenes passwort');
		expect(admin.body.user).toMatchObject({ role: 'admin', status: 'active' });
	});

	it('writes the activation to the trail, with the invited person as actor', async () => {
		const { token, userId } = await api.invited();
		await api
			.browser()
			.post('/auth/invitations/accept', { token, password: 'mein eigenes passwort' });

		const { rows } = await api.superuser.query(
			`select actor_user_id, diff, request_id is not null as has_request
			   from audit.log where table_name = 'users' and row_id = $1 and diff ? 'status'
			  order by id desc limit 1`,
			[userId]
		);
		expect(rows[0]).toEqual({
			actor_user_id: userId,
			diff: { status: ['invited', 'active'] },
			has_request: true
		});
	});

	it('refuses an expired invitation', async () => {
		const { token, userId } = await api.invited();
		await api.superuser.query(
			`update auth.tokens set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
			  where user_id = $1`,
			[userId]
		);

		const browser = api.browser();
		expect((await browser.post('/auth/invitations/inspect', { token })).status).toBe(400);
		const accepted = await browser.post('/auth/invitations/accept', {
			token,
			password: 'mein eigenes passwort'
		});
		expect(accepted.status).toBe(400);
		expect(accepted.body.code).toBe('TOKEN_INVALID');
	});

	it('refuses a common password and keeps the invitation open', async () => {
		const { token } = await api.invited();
		const browser = api.browser();

		const answer = await browser.post('/auth/invitations/accept', {
			token,
			password: 'Passwort1234'
		});
		expect(answer.status).toBe(400);
		expect(answer.body.details).toEqual([
			{ field: 'password', code: 'custom', message: 'password.common' }
		]);
		expect((await browser.post('/auth/invitations/inspect', { token })).status).toBe(200);
	});
});

describe('password reset', () => {
	it('answers alike for known and unknown addresses and mails only the known one', async () => {
		const { email } = await api.member();
		const sentBefore = api.mails.length;

		const known = await api.browser().post('/auth/password/forgot', { email });
		const unknown = await api
			.browser()
			.post('/auth/password/forgot', { email: 'niemand@example.test' });
		expect([known.status, unknown.status]).toEqual([204, 204]);
		expect(known.body).toEqual(unknown.body);

		await resetToken(email);
		expect(api.mails.slice(sentBefore).map((mail) => mail.to)).toEqual([email]);
	});

	it('sets the new password, ends every session and sends a notice', async () => {
		const { email } = await api.member();
		const laptop = api.browser();
		await laptop.signIn(email);

		await api.browser().post('/auth/password/forgot', { email });
		const token = await resetToken(email);
		const reset = await api
			.browser()
			.post('/auth/password/reset', { token, password: 'ein ganz neues passwort' });
		expect(reset.status).toBe(204);

		expect((await laptop.get('/auth/session')).status).toBe(401);
		expect((await api.browser().signIn(email)).status).toBe(401);
		expect((await api.browser().signIn(email, 'ein ganz neues passwort')).status).toBe(200);
		await vi.waitFor(() =>
			expect(api.mails.some((mail) => mail.to === email && /geändert/.test(mail.subject))).toBe(
				true
			)
		);

		const again = await api
			.browser()
			.post('/auth/password/reset', { token, password: 'noch ein neues passwort' });
		expect(again.body.code).toBe('TOKEN_INVALID');
	});

	it('sends at most three reset mails an hour to one address, from whatever address asked', async () => {
		const { email } = await api.member();
		for (let i = 0; i < 3; i++) {
			expect((await api.browser().post('/auth/password/forgot', { email })).status).toBe(204);
		}
		const fourth = await api
			.browser()
			.post('/auth/password/forgot', { email: email.toUpperCase() });
		expect(fourth.status).toBe(429);
		expect(fourth.body.code).toBe('RATE_LIMITED');
	});
});
