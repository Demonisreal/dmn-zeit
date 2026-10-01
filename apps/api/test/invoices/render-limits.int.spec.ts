import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MAX_REPORT_ENTRIES } from '../../src/documents/documents.service';
import { renderInWorker, type RenderJob } from '../../src/documents/worker';
import { startApi, type Api } from '../auth/api';
import { signedIn } from '../helpers/desk';
import { seedBillingProfile, seedClient, seedDraft } from '../helpers/invoices';
import { createPerson, createTenant } from '../helpers/pg';

vi.mock('../../src/documents/worker', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../src/documents/worker')>();
	const { withRenderSlot: inSlot } = await import('../../src/documents/render-limit');
	return {
		...original,
		renderInWorker: vi.fn((job: RenderJob) => inSlot(() => original.renderJob(job)))
	};
});

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(() => api.app.close());

async function office() {
	const tenant = await createTenant();
	await seedBillingProfile(api.superuser, tenant);
	const admin = await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId, {
		reauth: true
	});
	return { tenant, admin, clientId: await seedClient(api.superuser, tenant) };
}

const LONG_TEXT = 'Konzeption Umsetzung Abstimmung Abnahme Dokumentation Schulung '
	.repeat(16)
	.slice(0, 1000);

describe('documents past the page limit', () => {
	it('answers 422 PAGE_LIMIT on the download and does not render the snapshot again right away', async () => {
		const { tenant, admin, clientId } = await office();
		const draftId = await seedDraft(api.superuser, tenant, clientId);
		await api.superuser.query(
			`insert into app.invoice_lines (
				tenant_id, invoice_id, client_id, position, kind, description, quantity_milli, unit,
				unit_price_cents, net_cents, tax_category, tax_rate_bp
			 ) select $1, $2, $3, gs, 'item', $4, 1000, 'HUR', 5000, 5000, 'standard', 1900
			     from generate_series(2, 80) gs`,
			[tenant, draftId, clientId, LONG_TEXT]
		);
		await api.superuser.query(
			`update app.clients set street = 'Hafenstraße 12', postal_code = '20359', city = 'Hamburg' where id = $1`,
			[clientId]
		);
		const render = vi.mocked(renderInWorker);
		const before = render.mock.calls.length;

		const issued = await admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' });
		expect(issued.status).toBe(200);
		await expect(render.mock.results.at(-1)!.value).rejects.toMatchObject({
			name: 'PageLimitError'
		});

		for (let i = 0; i < 2; i++) {
			const download = await admin.get(`/invoices/${draftId}/document`);
			expect(download.status).toBe(422);
			expect(download.body).toEqual({
				code: 'PAGE_LIMIT',
				message: 'Document runs past 50 pages',
				details: { maxPages: 50 }
			});
		}
		expect(render.mock.calls.length - before).toBe(1);
	});
});

describe('a document that failed to render', () => {
	it('answers 503 with Retry-After for a while instead of rendering it on every download', async () => {
		const { tenant, admin, clientId } = await office();
		const draftId = await seedDraft(api.superuser, tenant, clientId);
		const render = vi.mocked(renderInWorker);
		render.mockRejectedValueOnce(new Error('Rendering timed out after 5s'));
		const before = render.mock.calls.length;

		expect((await admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' })).status).toBe(200);

		const download = await admin.get(`/invoices/${draftId}/document`);
		expect(download.status).toBe(503);
		expect(download.body.code).toBe('RENDER_BUSY');
		const retryAfter = Number(download.headers['retry-after']);
		expect(retryAfter).toBeGreaterThan(0);
		expect(retryAfter).toBeLessThanOrEqual(30);
		expect(render.mock.calls.length - before).toBe(1);
	});
});

describe('time report size', () => {
	it(`refuses a pdf over ${MAX_REPORT_ENTRIES} bookings with 400 and still hands out the csv`, async () => {
		const { tenant, admin } = await office();
		const client = (await admin.post('/clients', { name: 'Großkunde KG' })).body;
		const project = (await admin.post('/projects', { clientId: client.id, name: 'Rahmenvertrag' }))
			.body;
		const worker = await createPerson(tenant);

		await api.superuser.query('begin');
		await api.superuser.query(`select set_config('app.role', 'hr', true)`);
		await api.superuser.query(
			`insert into app.project_entries (tenant_id, employee_id, project_id, started_at, ended_at, note, source)
			 select $1, $2, $3,
			        timestamptz '2026-04-01 06:00+02' + (gs / 600) * interval '1 day' + (gs % 600) * interval '1 minute',
			        timestamptz '2026-04-01 06:01+02' + (gs / 600) * interval '1 day' + (gs % 600) * interval '1 minute',
			        'Kurzer Handgriff', 'manual'
			   from generate_series(0, $4::int - 1) gs`,
			[tenant, worker.employeeId, project.id, MAX_REPORT_ENTRIES + 1]
		);
		await api.superuser.query('commit');

		const route = `/exports/time-report?client=${client.id}&from=2026-04-01&to=2026-04-30`;
		const refused = await admin.get(`${route}&format=pdf`);
		expect(refused.status).toBe(400);
		expect(refused.body.details).toContainEqual(
			expect.objectContaining({
				message: 'report.tooManyEntries',
				params: { max: MAX_REPORT_ENTRIES }
			})
		);

		const csv = await admin.get(`${route}&format=csv`);
		expect(csv.status).toBe(200);
		expect(csv.text.trim().split('\n')).toHaveLength(MAX_REPORT_ENTRIES + 4);
	});
});
