import { sessionSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cookieFrom, startApi, type Api } from './api';

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(() => api.app.close());

describe('POST /api/auth/login', () => {
	it('opens a session behind a cookie that scripts cannot read', async () => {
		const { email } = await api.member();
		const browser = api.browser();
		const answer = await browser.signIn(email.toUpperCase());

		expect(answer.status).toBe(200);
		expect(cookieFrom(answer, 'zeit_sid')).toMatch(
			/^zeit_sid=[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict$/
		);
		expect(sessionSchema.safeParse(answer.body).success).toBe(true);
		expect(answer.body).toMatchObject({ user: { email }, mode: 'test' });

		const reload = await browser.get('/auth/session');
		expect(reload.status).toBe(200);
		expect(reload.body.csrfToken).toBe(answer.body.csrfToken);
	});

	it('answers 401 without a session', async () => {
		const answer = await api.browser().get('/auth/session');
		expect(answer.status).toBe(401);
		expect(answer.body).toEqual({
			code: 'UNAUTHENTICATED',
			message: 'Not signed in',
			details: null
		});
	});

	it('gives one answer for an unknown address, a wrong password and an account without one', async () => {
		const known = await api.member();
		const passwordless = await api.member();
		await api.superuser.query('delete from auth.credentials where user_id = $1', [
			passwordless.userId
		]);

		const answers = await Promise.all([
			api.browser().signIn('niemand@example.test'),
			api.browser().signIn(known.email, 'kaffee mit milch'),
			api.browser().signIn(passwordless.email)
		]);
		for (const answer of answers) {
			expect(answer.status).toBe(401);
			expect(answer.body).toEqual(answers[0]!.body);
		}
		expect(answers[0]!.body.code).toBe('INVALID_CREDENTIALS');
	});

	it('locks the account after five misses, then even the right password is turned away', async () => {
		const { email, userId } = await api.member();
		const browser = api.browser();
		for (let i = 0; i < 5; i++) {
			expect((await browser.signIn(email, `falsch geraten ${i}`)).status).toBe(401);
		}

		const locked = await browser.signIn(email);
		expect(locked.status).toBe(401);
		expect(locked.body.code).toBe('INVALID_CREDENTIALS');
		expect(cookieFrom(locked, 'zeit_sid')).toBeUndefined();

		const { rows } = await api.superuser.query(
			'select failed_count, locked_until > now() as locked from auth.credentials where user_id = $1',
			[userId]
		);
		expect(rows[0]).toEqual({ failed_count: 5, locked: true });
	});

	it('answers the eleventh try in a minute from one address with 429 and Retry-After', async () => {
		const browser = api.browser();
		for (let i = 0; i < 10; i++) {
			expect((await browser.signIn('niemand@example.test')).status).toBe(401);
		}

		const blocked = await browser.signIn('niemand@example.test');
		expect(blocked.status).toBe(429);
		expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
		expect(blocked.body).toMatchObject({ code: 'RATE_LIMITED', details: null });

		expect((await api.browser().signIn('niemand@example.test')).status).toBe(401);
	});
});
