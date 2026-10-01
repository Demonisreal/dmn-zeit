import { sessionSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { connectAs } from '../helpers/pg';
import { cookieFrom, expectContract, PASSWORD, startApi, type Api } from './api';

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(() => api.app.close());

async function lockOf(userId: string) {
	const { rows } = await api.superuser.query(
		'select failed_count, locked_until > now() as locked from auth.credentials where user_id = $1',
		[userId]
	);
	return rows[0];
}

function median(times: number[]) {
	return [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!;
}

describe('POST /api/auth/login', () => {
	it('opens a session behind a cookie that scripts cannot read', async () => {
		const { email } = await api.member();
		const browser = api.browser();
		const answer = await browser.signIn(email.toUpperCase());

		expect(answer.status).toBe(200);
		expect(cookieFrom(answer, 'zeit_sid')).toMatch(
			/^zeit_sid=[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict$/
		);
		expectContract(sessionSchema, answer.body);
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
			// the miss is counted after the answer went out
			await vi.waitFor(async () => expect((await lockOf(userId)).failed_count).toBe(i + 1));
		}

		const locked = await browser.signIn(email);
		expect(locked.status).toBe(401);
		expect(locked.body.code).toBe('INVALID_CREDENTIALS');
		expect(cookieFrom(locked, 'zeit_sid')).toBeUndefined();
		expect(await lockOf(userId)).toEqual({ failed_count: 5, locked: true });
	});

	it('answers a wrong password without waiting for the lock count', async () => {
		const { email, userId } = await api.member();
		const holder = await connectAs('superuser');
		await holder.query('begin');
		await holder.query('select 1 from auth.credentials where user_id = $1 for update', [userId]);

		// with the count in the request, the answer would hang on the row lock until the timeout
		const answer = await api
			.browser()
			.post('/auth/login', { email, password: 'kaffee mit milch' })
			.timeout(5_000);
		expect(answer.status).toBe(401);
		expect((await lockOf(userId)).failed_count).toBe(0);

		await holder.query('commit');
		await vi.waitFor(async () => expect((await lockOf(userId)).failed_count).toBe(1));
	});

	it('takes about as long for a known address with a wrong password as for an unknown one', async () => {
		const members = await Promise.all([api.member(), api.member(), api.member()]);
		const timed = async (email: string, password: string) => {
			const start = performance.now();
			expect((await api.browser().post('/auth/login', { email, password })).status).toBe(401);
			return performance.now() - start;
		};
		const unknown: number[] = [];
		const known: number[] = [];
		for (let i = 0; i < 9; i++) {
			unknown.push(await timed(`niemand-${i}@example.test`, PASSWORD));
			known.push(await timed(members[i % 3]!.email, `falsch geraten ${i}`));
		}

		// relative, argon2 is most of the answer time, so a skipped dummy hash has to show here
		expect(Math.abs(median(known) - median(unknown))).toBeLessThan(median(known) / 2);
	});

	it('answers the 61st try in a minute from one address with 429 and Retry-After', async () => {
		const browser = api.browser();
		for (let i = 0; i < 60; i++) {
			expect((await browser.signIn(`niemand-hier-${i}@example.test`)).status).toBe(401);
		}

		const blocked = await browser.signIn('niemand-hier@example.test');
		expect(blocked.status).toBe(429);
		expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
		expect(blocked.body).toMatchObject({ code: 'RATE_LIMITED', details: null });

		expect((await api.browser().signIn('niemand-hier@example.test')).status).toBe(401);
	});

	it('lets one email address be tried ten times in a quarter hour, from any number of addresses', async () => {
		for (let i = 0; i < 10; i++) {
			expect((await api.browser().signIn('viel-besucht@example.test')).status).toBe(401);
		}

		const blocked = await api.browser().signIn('viel-besucht@example.test');
		expect(blocked.status).toBe(429);
		expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
		expect(blocked.body.code).toBe('RATE_LIMITED');
		expect((await api.browser().signIn('selten@example.test')).status).toBe(401);
	});

	it('stops a whole /24 after 200 tries in a quarter hour, the next network goes on', async () => {
		// ten tries per address before the per-address limit, twenty addresses fill the network
		await Promise.all(
			Array.from({ length: 20 }, async (_, host) => {
				const browser = api.browser(`198.51.100.${host + 1}`);
				for (let i = 0; i < 10; i++) {
					expect((await browser.signIn(`netz-${host}-${i}@example.test`)).status).toBe(401);
				}
			})
		);

		const blocked = await api.browser('198.51.100.21').signIn('netz-21@example.test');
		expect(blocked.status).toBe(429);
		expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
		expect(blocked.body.code).toBe('RATE_LIMITED');
		expect((await api.browser('198.51.101.1').signIn('netz-daneben@example.test')).status).toBe(
			401
		);
	});
});
