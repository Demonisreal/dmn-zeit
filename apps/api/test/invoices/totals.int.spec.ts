import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RenderJob } from '../../src/documents/worker';
import { startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
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
let admin: Desk;
let clientId: string;
let invoiceId: string;

type Group = { taxCategory: string; taxRateBp: number; netCents: string; taxCents: string };

const position = (description: string, unitPriceCents: string, taxCategory: string) => ({
	description,
	quantityMilli: '1000',
	unit: 'C62',
	unitPriceCents,
	taxCategory
});

async function stored(id: string) {
	const { rows } = await api.superuser.query(
		'select net_cents::text, tax_cents::text, gross_cents::text from app.invoices where id = $1',
		[id]
	);
	return rows[0];
}

async function listed(id: string) {
	const list = await admin.get(`/invoices?client=${clientId}`);
	return list.body.items.find((summary: { id: string }) => summary.id === id).grossCents;
}

const groupsOf = (groups: Group[]) =>
	groups.map((group) => [group.taxCategory, group.taxRateBp, group.netCents, group.taxCents]);

beforeAll(async () => {
	api = await startApi();
	const tenant = await createTenant();
	await seedBillingProfile(api.superuser, tenant);
	admin = await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId, {
		reauth: true
	});
	clientId = await seedClient(api.superuser, tenant);
	invoiceId = await seedDraft(api.superuser, tenant, clientId);

	const lines = [
		...Array.from({ length: 10 }, () => position('Porto', '2', 'standard')),
		...Array.from({ length: 3 }, () => position('Fachbuch', '50', 'reduced')),
		{
			...position('Prüfung', '1000', 'exempt'),
			exemptionReason: 'Steuerfrei nach § 4 Nr. 21 UStG'
		},
		position('Rabatt', '-1000', 'standard')
	];
	for (const line of lines) {
		expect((await admin.post(`/invoices/${invoiceId}/lines`, line)).status).toBe(201);
	}
});

afterAll(() => api.app.close());

describe('totals of an invoice with 19, 7 and 0 percent and a discount', () => {
	it('takes the tax of each rate from its summed net amount on the draft', async () => {
		const draft = (await admin.get(`/invoices/${invoiceId}`)).body;
		expect(groupsOf(draft.taxGroups)).toEqual([
			['standard', 1900, '4020', '764'],
			['reduced', 700, '150', '11'],
			['exempt', 0, '1000', '0']
		]);
		expect(draft.totals).toMatchObject({ netCents: '5170', taxCents: '775', grossCents: '5945' });
	});

	it('stores the same sums when the database issues it, and lists them', async () => {
		const issued = await admin.post(`/invoices/${invoiceId}/issue`, { format: 'pdf' });
		expect(issued.status).toBe(200);
		expect(issued.body.totals).toMatchObject({
			netCents: '5170',
			taxCents: '775',
			grossCents: '5945'
		});
		expect(await stored(invoiceId)).toEqual({
			net_cents: '5170',
			tax_cents: '775',
			gross_cents: '5945'
		});
		expect(await listed(invoiceId)).toBe('5945');
	});

	it('mirrors every sum in the cancellation, half cents rounded away from zero', async () => {
		const cancellation = await admin.post(`/invoices/${invoiceId}/cancel`, {
			reason: 'Rabatt war nicht vereinbart'
		});
		expect(cancellation.status).toBe(200);
		expect(groupsOf(cancellation.body.taxGroups)).toEqual([
			['standard', 1900, '-4020', '-764'],
			['reduced', 700, '-150', '-11'],
			['exempt', 0, '-1000', '0']
		]);
		expect(await stored(cancellation.body.id)).toEqual({
			net_cents: '-5170',
			tax_cents: '-775',
			gross_cents: '-5945'
		});
		expect(await listed(cancellation.body.id)).toBe('-5945');
	});
});
