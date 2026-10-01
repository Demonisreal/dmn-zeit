import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_SANDBOXES } from '../../src/demo/demo.service';
import { createTenant } from '../helpers/pg';
import { openSandbox, startDemo, type Demo } from './sandbox';

let demo: Demo;

beforeAll(async () => {
	demo = await startDemo();
});

afterAll(() => demo.app.close());

// bare tenant rows, the cap only counts them through ops.active_tenants()
async function sandboxes(count: number, expiresIn = '1 hour') {
	await demo.superuser.query(
		`insert into app.tenants (name, slug, state, kind, expires_at)
		 select 'Musterbetrieb (Beispiel)', 'voll-' || gen_random_uuid(), 'NW', 'sandbox', now() + $2::interval
		   from generate_series(1, $1::int)`,
		[count, expiresIn]
	);
}

// a visitor's solo workspace rides along with the company, the cap counts the companies
async function running() {
	const { rows } = await demo.superuser.query(
		`select count(*)::int as n from ops.active_tenants() where kind = 'sandbox' and workspace = 'company'`
	);
	return rows[0].n as number;
}

describe('sandbox cap', () => {
	it(`still opens the ${MAX_SANDBOXES}th, expired sandboxes and live tenants do not count`, async () => {
		await sandboxes(MAX_SANDBOXES - 1 - (await running()));
		await sandboxes(20, '-1 minute');
		await createTenant();

		await openSandbox(demo);
		expect(await running()).toBe(MAX_SANDBOXES);
	});

	it('refuses the next one with 503 until the purge frees a slot', async () => {
		await sandboxes(MAX_SANDBOXES - (await running()));
		const answer = await demo.visitor().post('/demo/sandboxes', { locale: 'de' });

		expect(answer.status).toBe(503);
		expect(answer.body).toEqual({
			code: 'SANDBOX_LIMIT',
			message: 'Too many demo sandboxes',
			details: { retryAfter: 900 }
		});
		expect(answer.headers['retry-after']).toBe('900');
		expect(await running()).toBe(MAX_SANDBOXES);
	});
});
