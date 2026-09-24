import type { Session } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { server } from '../../mocks/server';
import { request } from './client';
import { ApiRequestError } from './errors';
import { queryClient, sessionKey } from './query-client';

const seen = z.object({
	csrf: z.string().nullable(),
	type: z.string().nullable(),
	body: z.string()
});

const echo = http.all('/api/echo', async ({ request: req }) =>
	HttpResponse.json({
		csrf: req.headers.get('X-CSRF-Token'),
		type: req.headers.get('Content-Type'),
		body: req.method === 'GET' ? '' : await req.text()
	})
);

const signIn = (csrfToken: string) =>
	queryClient.setQueryData(sessionKey, { csrfToken } as Session);

describe('request', () => {
	it('sends writes as json with the csrf token of the session', async () => {
		server.use(echo);
		signIn('tok-123');

		const got = await request('/echo', { method: 'POST', body: { note: 'ok' }, schema: seen });

		expect(got).toEqual({ csrf: 'tok-123', type: 'application/json', body: '{"note":"ok"}' });
	});

	it('sends an empty object when a write has no body', async () => {
		server.use(echo);
		signIn('tok-123');

		const got = await request('/echo', { method: 'DELETE', schema: seen });

		expect(got.body).toBe('{}');
	});

	it('leaves reads and requests before login without a token', async () => {
		server.use(echo);

		expect(await request('/echo', { schema: seen })).toEqual({ csrf: null, type: null, body: '' });
		expect((await request('/echo', { method: 'POST', schema: seen })).csrf).toBeNull();
	});

	it('throws the error form of the api with code and field issues', async () => {
		server.use(
			http.post('/api/corrections', () =>
				HttpResponse.json(
					{
						code: 'VALIDATION',
						message: 'Invalid input',
						details: [
							{ field: 'reason', code: 'too_small', message: 'Too short', params: { minimum: 10 } }
						]
					},
					{ status: 400 }
				)
			)
		);

		const err = await request('/corrections', { method: 'POST' }).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(ApiRequestError);
		expect(err).toMatchObject({
			status: 400,
			code: 'VALIDATION',
			details: [
				{ field: 'reason', code: 'too_small', message: 'Too short', params: { minimum: 10 } }
			]
		});
	});

	it('turns a proxy page without json into INTERNAL', async () => {
		server.use(
			http.get('/api/clock', () => new HttpResponse('<h1>Bad Gateway</h1>', { status: 502 }))
		);

		await expect(request('/clock')).rejects.toMatchObject({ status: 502, code: 'INTERNAL' });
	});

	it('checks answers against the schema it was given', async () => {
		server.use(http.get('/api/echo', () => HttpResponse.json({ csrf: 1 })));

		await expect(request('/echo', { schema: seen })).rejects.toThrow();
	});
});
