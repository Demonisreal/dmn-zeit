import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cookieFrom, startApi, type Api } from './api';

let api: Api;

// behind https, as in production; a file of its own because the config is read once per module graph
beforeAll(async () => {
	api = await startApi('https://zeit.example.test');
});

afterAll(() => api.app.close());

describe('behind https', () => {
	it('names the cookie __Host- and marks it Secure, without a Domain', async () => {
		const { email } = await api.member();
		const browser = api.browser();
		const answer = await browser.signIn(email);

		expect(answer.status).toBe(200);
		expect(cookieFrom(answer, '__Host-zeit_sid')).toMatch(
			/^__Host-zeit_sid=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict$/
		);
		expect((await browser.get('/auth/session')).status).toBe(200);
	});
});

describe('headers and errors of a json api', () => {
	it('forbids loading and framing and leaves HSTS to caddy', async () => {
		const answer = await request(api.http).get('/api/health');

		expect(answer.headers['content-security-policy']).toBe(
			"default-src 'none';frame-ancestors 'none'"
		);
		expect(answer.headers['x-frame-options']).toBe('DENY');
		expect(answer.headers['x-content-type-options']).toBe('nosniff');
		expect(answer.headers['strict-transport-security']).toBeUndefined();
		expect(answer.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('answers broken json in its own format', async () => {
		const answer = await request(api.http)
			.post('/api/auth/login')
			.set('Content-Type', 'application/json')
			.send('{"email": ');

		expect(answer.status).toBe(400);
		expect(answer.body).toEqual({ code: 'VALIDATION', message: 'Malformed JSON', details: [] });
	});

	it('answers a body over 100 kB with 413 PAYLOAD_TOO_LARGE', async () => {
		const answer = await request(api.http)
			.post('/api/auth/login')
			.set('Content-Type', 'application/json')
			.send(JSON.stringify({ email: 'x'.repeat(110_000), password: 'x' }));

		expect(answer.status).toBe(413);
		expect(answer.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', details: null });
	});

	it('answers unknown routes with its own 404', async () => {
		const answer = await request(api.http).get('/api/nope');
		expect(answer.status).toBe(404);
		expect(answer.body).toMatchObject({ code: 'NOT_FOUND', details: null });
	});
});
