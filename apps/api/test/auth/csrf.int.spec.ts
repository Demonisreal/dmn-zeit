import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api, type Browser } from './api';

let api: Api;
let browser: Browser;

beforeAll(async () => {
	api = await startApi();
	const { email } = await api.member();
	browser = api.browser();
	await browser.signIn(email);
});

afterAll(() => api.app.close());

// ending a session that does not exist: 404 once past the guards, and nothing is lost on the way
function probe(headers: Record<string, string>, body = '{}') {
	return request(api.http)
		.delete(`/api/auth/sessions/${randomUUID()}`)
		.set('X-Forwarded-For', browser.address)
		.set('Cookie', browser.cookie!)
		.set(headers)
		.send(body);
}

const json = { 'Content-Type': 'application/json' };

describe('CSRF protection', () => {
	it('lets a same-origin json write with the token through', async () => {
		const answer = await probe({
			...json,
			'Sec-Fetch-Site': 'same-origin',
			'X-CSRF-Token': browser.csrf!
		});
		expect(answer.status).toBe(404);
	});

	// functions, because the token only exists once beforeAll has signed in
	it.each([
		['without a token', () => ({ 'Sec-Fetch-Site': 'same-origin' })],
		[
			'with a wrong token',
			() => ({ 'Sec-Fetch-Site': 'same-origin', 'X-CSRF-Token': 'x'.repeat(43) })
		],
		[
			'from the same site',
			() => ({ 'Sec-Fetch-Site': 'same-site', 'X-CSRF-Token': browser.csrf! })
		],
		['from another site', () => ({ 'Sec-Fetch-Site': 'cross-site', 'X-CSRF-Token': browser.csrf! })]
	])('refuses a write %s', async (_case, headers) => {
		const answer = await probe({ ...json, ...headers() });
		expect(answer.status).toBe(403);
		expect(answer.body.code).toBe('CSRF');
	});

	it('refuses a write that is not json, as a plain form would send it', async () => {
		const answer = await probe(
			{
				'Content-Type': 'application/x-www-form-urlencoded',
				'Sec-Fetch-Site': 'same-origin',
				'X-CSRF-Token': browser.csrf!
			},
			'a=1'
		);
		expect(answer.status).toBe(403);
		expect(answer.body.code).toBe('CSRF');
	});

	it('falls back to the Origin header when there is no fetch metadata', async () => {
		const token = { ...json, 'X-CSRF-Token': browser.csrf! };
		expect((await probe({ ...token, Origin: 'http://localhost:5173' })).status).toBe(404);
		expect((await probe({ ...token, Origin: 'http://localhost:5174' })).status).toBe(403);
		expect((await probe(token)).status).toBe(403);
	});

	it('guards the public login by origin, there is no session token yet', async () => {
		const login = (site: string) =>
			request(api.http)
				.post('/api/auth/login')
				.set('X-Forwarded-For', browser.address)
				.set('Sec-Fetch-Site', site)
				.send({ email: 'niemand@example.test', password: 'egal egal egal' });

		expect((await login('cross-site')).status).toBe(403);
		expect((await login('same-origin')).status).toBe(401);
	});

	it('does not ask for a token on reads', async () => {
		const answer = await request(api.http)
			.get('/api/auth/session')
			.set('Cookie', browser.cookie!)
			.set('Sec-Fetch-Site', 'cross-site');
		expect(answer.status).toBe(200);
	});
});
