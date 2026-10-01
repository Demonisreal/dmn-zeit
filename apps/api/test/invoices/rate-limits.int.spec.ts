import { randomUUID } from 'node:crypto';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { createPerson, createTenant } from '../helpers/pg';

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(() => api.app.close());

const hr = async (tenant: string) =>
	signedIn(api, (await createPerson(tenant, { role: 'hr' })).userId);

function expectLimited(blocked: request.Response) {
	expect(blocked.status).toBe(429);
	expect(blocked.body.code).toBe('RATE_LIMITED');
	const retryAfter = Number(blocked.headers['retry-after']);
	expect(retryAfter).toBeGreaterThan(0);
	expect(retryAfter).toBeLessThanOrEqual(60);
}

describe('rate limit per person on the time reports', () => {
	const routes = [
		{
			route: 'the time report of an invoice',
			send: (desk: Desk) => desk.get(`/invoices/${randomUUID()}/time-report?format=csv`)
		},
		{
			route: 'the time report export',
			send: (desk: Desk) =>
				desk.get(
					`/exports/time-report?client=${randomUUID()}&from=2026-04-01&to=2026-04-30&format=csv`
				)
		}
	];

	it.each(routes)('stops $route after 20 calls a minute of one person', async ({ send }) => {
		const tenant = await createTenant();
		const first = await hr(tenant);
		const colleague = await hr(tenant);

		const within: number[] = [];
		for (let i = 0; i < 20; i++) within.push((await send(first)).status);
		expect(within).toEqual(Array(20).fill(404));

		expectLimited(await send(first));
		expect((await send(colleague)).status).toBe(404);
	});
});

describe('rate limit per person on the payment status', () => {
	it('counts paid and unpaid together, 30 a minute', async () => {
		const tenant = await createTenant();
		const first = await hr(tenant);
		const stranger = await hr(await createTenant());
		const paid = (desk: Desk) =>
			desk.post(`/invoices/${randomUUID()}/paid`, { paidOn: '2026-01-15' });
		const unpaid = (desk: Desk) => desk.post(`/invoices/${randomUUID()}/unpaid`);

		const within: number[] = [];
		for (let i = 0; i < 15; i++) {
			within.push((await paid(first)).status, (await unpaid(first)).status);
		}
		expect(within).toEqual(Array(30).fill(404));

		expectLimited(await paid(first));
		expectLimited(await unpaid(first));
		expect((await unpaid(stranger)).status).toBe(404);
	});
});
