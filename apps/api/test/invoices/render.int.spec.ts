import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_CONCURRENT, MAX_QUEUED, withRenderSlot } from '../../src/documents/render-limit';
import { startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { createPerson, createTenant } from '../helpers/pg';

let api: Api;
let hr: Desk;

beforeAll(async () => {
	api = await startApi();
	const tenant = await createTenant();
	hr = await signedIn(api, (await createPerson(tenant, { role: 'hr' })).userId);
});

afterAll(() => api.app.close());

// a job that only finishes once its own resolve() is called, so a test can hold a slot open
function deferred() {
	let release!: () => void;
	const done = new Promise<void>((resolve) => (release = resolve));
	return { release, run: () => withRenderSlot(() => done) };
}

describe('render capacity', () => {
	// the real pdfkit worker (worker.ts) cannot finish a render under vitest's module loader
	// (see the skipped test in invoices.int.spec.ts), so a full HTTP proof of "within capacity, 200"
	// isn't testable here yet; this instead saturates the same in-process pool render-limit.guard.ts
	// reads from and checks that a real HTTP request to the guarded route gets the real 503, not a 500
	it('answers 503 with Retry-After on the real route once the render pool and its queue are both full', async () => {
		const jobs = Array.from({ length: MAX_CONCURRENT + MAX_QUEUED }, () => deferred());
		const pending = jobs.map((job) => job.run());
		await Promise.resolve();

		try {
			const busy = await hr.get(`/invoices/${randomUUID()}/preview.pdf`);
			expect(busy.status).toBe(503);
			expect(busy.body.code).toBe('RENDER_BUSY');
			expect(busy.headers['retry-after']).toBe('5');
		} finally {
			for (const job of jobs) job.release();
			await Promise.all(pending);
		}
	});
});
