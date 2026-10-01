import { invoiceSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RenderJob } from '../../src/documents/worker';
import { expectContract, startApi, type Api } from '../auth/api';
import { signedIn } from '../helpers/desk';
import { seedBillingProfile, seedClient, seedDraft } from '../helpers/invoices';
import { createPerson, createTenant } from '../helpers/pg';

vi.mock('../../src/documents/worker', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../src/documents/worker')>();
	const { withRenderSlot } = await import('../../src/documents/render-limit');
	return {
		...original,
		renderInWorker: vi.fn((job: RenderJob) => withRenderSlot(() => original.renderJob(job)))
	};
});

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(() => api.app.close());

describe.each(['live', 'sandbox'] as const)('an issued invoice of a %s tenant', (kind) => {
	it('keeps to the invoice schema, and so does its cancellation', async () => {
		const tenant = await createTenant({ kind });
		await seedBillingProfile(api.superuser, tenant);
		const admin = await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId, {
			reauth: true
		});
		const draftId = await seedDraft(api.superuser, tenant, await seedClient(api.superuser, tenant));

		const issued = await admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' });
		expect(issued.status).toBe(200);
		expectContract(invoiceSchema, issued.body);
		expectContract(invoiceSchema, (await admin.get(`/invoices/${draftId}`)).body);

		const cancelled = await admin.post(`/invoices/${draftId}/cancel`, {
			reason: 'Rechnung an den falschen Kunden'
		});
		expect(cancelled.status).toBe(200);
		expectContract(invoiceSchema, cancelled.body);
		expect(cancelled.body.seller).toEqual(issued.body.seller);
	});
});
