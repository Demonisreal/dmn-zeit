import { invoiceLineSchema, invoiceSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RenderJob } from '../../src/documents/worker';
import { expectContract, startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { createPerson, createTenant, type Person } from '../helpers/pg';

vi.mock('../../src/documents/worker', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../src/documents/worker')>();
	const { withRenderSlot } = await import('../../src/documents/render-limit');
	return {
		...original,
		renderInWorker: vi.fn((job: RenderJob) => withRenderSlot(() => original.renderJob(job)))
	};
});

let api: Api;
let tenant: string;
let hr: Desk;
let admin: Desk;
let worker: Person;

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	hr = await signedIn(api, (await createPerson(tenant, { role: 'hr' })).userId);
	admin = await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId, { reauth: true });
	worker = await createPerson(tenant);
});

afterAll(() => api.app.close());

async function newClient(name: string) {
	const answer = await hr.post('/clients', { name, street: 'Hafenstraße 12', postalCode: '20359', city: 'Hamburg' });
	expect(answer.status).toBe(201);
	return answer.body;
}

async function billedProject(clientId: string, rateCents: string) {
	const project = (await hr.post('/projects', { clientId, name: 'Website' })).body;
	await hr.post('/rates', { clientId, validFrom: '2026-01-01', rateCents });
	return project;
}

async function bookTime(from: string, to: string, projectId: string) {
	const desk = await signedIn(api, worker.userId);
	const booked = await desk.post('/project-entries', {
		projectId,
		startedAt: from,
		endedAt: to,
		note: 'Umsetzung'
	});
	expect(booked.status).toBe(201);
	return booked.body;
}

describe('drafts', () => {
	it('books the unbilled time of a period into a priced line', async () => {
		const client = await newClient('Korn KG');
		const project = await billedProject(client.id, '6000');
		await bookTime('2026-09-01T09:00:00+02:00', '2026-09-01T11:00:00+02:00', project.id);

		const draft = await hr.post('/invoices/drafts', {
			clientId: client.id,
			from: '2026-09-01',
			to: '2026-09-30'
		});
		expect(draft.status).toBe(201);
		expectContract(invoiceSchema, draft.body);
		expect(draft.body.status).toBe('draft');
		expect(draft.body.lines).toHaveLength(1);
		expect(draft.body.lines[0]).toMatchObject({ kind: 'time', minutes: 120, netCents: '12000' });
		// standard 19% vat on the one line's net amount
		expect(draft.body.totals).toMatchObject({ netCents: '12000', taxCents: '2280', grossCents: '14280' });

		// the booked entry is reserved, a second draft over the same period finds nothing left
		const empty = await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-01', to: '2026-09-30' });
		expect(empty.status).toBe(409);
		expect(empty.body.code).toBe('INVALID_STATE');
	});

	it('adds a free position and lets only its own kind change afterwards', async () => {
		const client = await newClient('Fracht GmbH');
		const project = await billedProject(client.id, '5000');
		await bookTime('2026-09-02T09:00:00+02:00', '2026-09-02T10:00:00+02:00', project.id);
		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-02', to: '2026-09-02' })
		).body;

		const line = await hr.post(`/invoices/${draft.id}/lines`, {
			description: 'Anfahrt',
			quantityMilli: '2000',
			unit: 'DAY',
			unitPriceCents: '5000',
			taxCategory: 'standard'
		});
		expect(line.status).toBe(201);
		expectContract(invoiceLineSchema, line.body);
		expect(line.body.netCents).toBe('10000');

		const timeLineId = draft.lines[0].id;
		const blocked = await hr.patch(`/invoices/${draft.id}/lines/${timeLineId}`, { unitPriceCents: '1' });
		expect(blocked.status).toBe(409);

		const renamed = await hr.patch(`/invoices/${draft.id}/lines/${timeLineId}`, { description: 'Umsetzung Sept.' });
		expect(renamed.body.description).toBe('Umsetzung Sept.');

		const removed = await hr.delete(`/invoices/${draft.id}/lines/${line.body.id}`);
		expect(removed.status).toBe(204);
		const after = await hr.get(`/invoices/${draft.id}`);
		expect(after.body.lines.map((l: { id: string }) => l.id)).not.toContain(line.body.id);
	});

	it('refuses a free position whose tax category does not match the invoice treatment', async () => {
		// planung-projekte.md, Risiko 17: an EU B2B client with a vat id makes the whole invoice reverse charge
		const client = await newClient('Brandt Reverse B.V.');
		await hr.patch(`/clients/${client.id}`, { countryCode: 'NL', isBusiness: true, vatId: 'NL123456789B01' });
		const project = await billedProject(client.id, '9000');
		await bookTime('2026-09-12T09:00:00+02:00', '2026-09-12T10:00:00+02:00', project.id);
		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-12', to: '2026-09-12' })
		).body;

		const mismatched = await hr.post(`/invoices/${draft.id}/lines`, {
			description: 'Anfahrt',
			quantityMilli: '1000',
			unit: 'DAY',
			unitPriceCents: '5000',
			taxCategory: 'standard'
		});
		expect(mismatched.status).toBe(400);
		expect(mismatched.body.details[0].message).toBe('invoice.taxCategoryMismatch');

		const matching = await hr.post(`/invoices/${draft.id}/lines`, {
			description: 'Anfahrt',
			quantityMilli: '1000',
			unit: 'DAY',
			unitPriceCents: '5000',
			taxCategory: 'reverse_charge'
		});
		expect(matching.status).toBe(201);

		const editedToStandard = await hr.patch(`/invoices/${draft.id}/lines/${matching.body.id}`, {
			taxCategory: 'standard'
		});
		expect(editedToStandard.status).toBe(400);
	});

	it('rounds a workday once even when a refresh picks up more time of that day', async () => {
		const client = (
			await hr.post('/clients', { name: 'Rundung KG', roundingIncrementMin: 15, roundingMode: 'up' })
		).body;
		const project = await billedProject(client.id, '6000');
		await bookTime('2026-09-08T09:00:00+02:00', '2026-09-08T09:05:00+02:00', project.id);

		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-08', to: '2026-09-08' })
		).body;
		expect(draft.lines).toHaveLength(1);
		expect(draft.lines[0].minutes).toBe(15);

		await bookTime('2026-09-08T09:05:00+02:00', '2026-09-08T09:10:00+02:00', project.id);
		const refreshed = await hr.post(`/invoices/${draft.id}/refresh`);
		expect(refreshed.status).toBe(200);
		// 5 + 5 raw minutes round up to 15 once, not two separate 15-minute positions
		expect(refreshed.body.lines).toHaveLength(1);
		expect(refreshed.body.lines[0].minutes).toBe(15);
	});

	it('deletes a draft and frees its time for a new one', async () => {
		const client = await newClient('Frei OHG');
		const project = await billedProject(client.id, '4000');
		await bookTime('2026-09-03T09:00:00+02:00', '2026-09-03T10:00:00+02:00', project.id);
		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-03', to: '2026-09-03' })
		).body;

		expect((await hr.delete(`/invoices/${draft.id}`)).status).toBe(204);
		expect((await hr.get(`/invoices/${draft.id}`)).status).toBe(404);

		const again = await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-03', to: '2026-09-03' });
		expect(again.status).toBe(201);
	});

	it('wants a reason on a tax exempt position and on no other', async () => {
		const client = await newClient('Prüfstelle KG');
		const project = await billedProject(client.id, '6000');
		await bookTime('2026-09-14T09:00:00+02:00', '2026-09-14T10:00:00+02:00', project.id);
		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-14', to: '2026-09-14' })
		).body;
		const fee = { description: 'Prüfungsgebühr', quantityMilli: '1000', unit: 'LS', unitPriceCents: '15000' };
		const add = (fields: object) => hr.post(`/invoices/${draft.id}/lines`, { ...fee, ...fields });
		const refused = (message: string) =>
			expect.objectContaining({
				status: 400,
				body: expect.objectContaining({ details: [{ field: 'exemptionReason', code: 'custom', message }] })
			});

		expect(await add({ taxCategory: 'exempt' })).toEqual(refused('invoice.exemptionReasonRequired'));
		expect(await add({ taxCategory: 'standard', exemptionReason: '§ 4 Nr. 21 UStG' })).toEqual(
			refused('invoice.exemptionReasonUnexpected')
		);
		expect((await add({ taxCategory: 'exempt', exemptionReason: ' ' })).status).toBe(400);

		const exempt = await add({ taxCategory: 'exempt', exemptionReason: '§ 4 Nr. 21 UStG' });
		expect(exempt.status).toBe(201);
		expectContract(invoiceLineSchema, exempt.body);
		expect(exempt.body).toMatchObject({ taxCategory: 'exempt', taxRateBp: 0, exemptionReason: '§ 4 Nr. 21 UStG' });
		expect((await hr.get(`/invoices/${draft.id}`)).body.legalNotes).toContain(
			'Umsatzsteuerbefreiung: § 4 Nr. 21 UStG'
		);

		const edit = (fields: object) => hr.patch(`/invoices/${draft.id}/lines/${exempt.body.id}`, fields);
		expect((await edit({ taxCategory: 'standard' })).body).toMatchObject({
			taxCategory: 'standard',
			taxRateBp: 1900,
			exemptionReason: null
		});
		expect(await edit({ taxCategory: 'exempt' })).toEqual(refused('invoice.exemptionReasonRequired'));
		expect((await edit({ taxCategory: 'exempt', exemptionReason: '§ 4 Nr. 22a UStG' })).body).toMatchObject({
			taxCategory: 'exempt',
			exemptionReason: '§ 4 Nr. 22a UStG'
		});
		expect((await edit({ description: 'Kursgebühr' })).body.exemptionReason).toBe('§ 4 Nr. 22a UStG');
	});

	it('takes the tax treatment of the new client when an emptied draft changes hands', async () => {
		const client = await newClient('Umzug KG');
		const project = await billedProject(client.id, '6000');
		await bookTime('2026-09-15T09:00:00+02:00', '2026-09-15T10:00:00+02:00', project.id);
		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-15', to: '2026-09-15' })
		).body;
		const abroad = await newClient('Brandt Umzug B.V.');
		await hr.patch(`/clients/${abroad.id}`, { countryCode: 'NL', isBusiness: true, vatId: 'NL123456789B01' });

		await hr.delete(`/invoices/${draft.id}/lines/${draft.lines[0].id}`);
		expect((await hr.patch(`/invoices/${draft.id}`, { clientId: abroad.id })).status).toBe(200);

		const line = { description: 'Anfahrt', quantityMilli: '1000', unit: 'DAY', unitPriceCents: '5000' };
		const standard = await hr.post(`/invoices/${draft.id}/lines`, { ...line, taxCategory: 'standard' });
		expect(standard.status).toBe(400);
		expect(standard.body.details[0].message).toBe('invoice.taxCategoryMismatch');
		const reverse = await hr.post(`/invoices/${draft.id}/lines`, { ...line, taxCategory: 'reverse_charge' });
		expect(reverse.status).toBe(201);
	});

	it('checks the period against the stored end when only one end changes', async () => {
		const client = await newClient('Zeitraum KG');
		const project = await billedProject(client.id, '6000');
		await bookTime('2026-09-13T09:00:00+02:00', '2026-09-13T10:00:00+02:00', project.id);
		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-13', to: '2026-09-13' })
		).body;

		const tooLong = await hr.patch(`/invoices/${draft.id}`, { from: '2025-09-12' });
		expect(tooLong.status).toBe(400);
		expect(tooLong.body.details).toEqual([{ field: 'to', code: 'custom', message: 'invoice.rangeTooLong' }]);

		const unordered = await hr.patch(`/invoices/${draft.id}`, { from: '2026-09-14' });
		expect(unordered.status).toBe(400);
		expect(unordered.body.details).toEqual([{ field: 'to', code: 'custom', message: 'range.unordered' }]);

		const longest = await hr.patch(`/invoices/${draft.id}`, { from: '2025-09-13' });
		expect(longest.status).toBe(200);
		expect(longest.body.serviceFrom).toBe('2025-09-13');
	});

	it('refuses a 501st position on a draft that already carries 500', async () => {
		const client = await newClient('Positionen KG');
		const project = await billedProject(client.id, '6000');
		await bookTime('2026-09-10T09:00:00+02:00', '2026-09-10T10:00:00+02:00', project.id);
		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-10', to: '2026-09-10' })
		).body;

		// fills the draft to the D-01 cap with one statement instead of 499 POSTs: positions 2..500,
		// the one time line from the draft already sits at position 1
		await api.superuser.query(
			`insert into app.invoice_lines
				(tenant_id, invoice_id, client_id, position, kind, description, quantity_milli, unit,
				 unit_price_cents, net_cents, tax_category, tax_rate_bp)
			 select $1, $2, $3, gs, 'item', 'Position ' || gs, '1000', 'HUR', '100', '100', 'standard', 1900
			   from generate_series(2, 500) as gs`,
			[tenant, draft.id, client.id]
		);

		const overflow = await hr.post(`/invoices/${draft.id}/lines`, {
			description: 'Zu viel',
			quantityMilli: '1000',
			unit: 'HUR',
			unitPriceCents: '100',
			taxCategory: 'standard'
		});
		expect(overflow.status).toBe(400);
		expect(overflow.body.code).toBe('VALIDATION');
		expect(overflow.body.details).toContainEqual(
			expect.objectContaining({ field: 'lines', message: 'invoice.tooManyLines' })
		);
	});
});

describe('issuing', () => {
	beforeAll(async () => {
		// § 33 UStDV drops the tax number only under 250 €, everything issued here is well above that
		await admin.patch('/billing/profile', {
			legalName: 'Mira Beispiel',
			street: 'Lindenweg 4',
			postalCode: '04109',
			city: 'Leipzig',
			taxNumber: '133/815/08150',
			vatId: null,
			previousYearRevenueCents: null,
			iban: null,
			bic: null,
			bankName: null,
			contactName: null,
			contactEmail: null,
			contactPhone: null,
			registerCourt: null,
			registerNumber: null
		});
	});

	it('goes from draft to issued to paid and back, in the same protocol', async () => {
		const client = await newClient('Rechnung AG');
		const project = await billedProject(client.id, '8000');
		await bookTime('2026-09-04T09:00:00+02:00', '2026-09-04T13:00:00+02:00', project.id);
		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-04', to: '2026-09-04' })
		).body;

		const issued = await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });
		expect(issued.status).toBe(200);
		expect(issued.body.status).toBe('issued');
		expect(issued.body.number).toEqual(expect.any(String));
		expect(issued.body.totals.grossCents).toBe('38080');

		const blocked = await hr.patch(`/invoices/${draft.id}`, { paymentTermsDays: 30 });
		expect(blocked.status).toBe(409);
		expect(blocked.body.code).toBe('INVALID_STATE');

		const withoutReauth = await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId);
		expect((await withoutReauth.post(`/invoices/${draft.id}/issue`, { format: 'pdf' })).status).toBe(403);

		const paid = await hr.post(`/invoices/${draft.id}/paid`, { paidOn: '2026-09-10' });
		expect(paid.status).toBe(200);
		expect(paid.body.status).toBe('paid');
		expect(paid.body.paidOn).toBe('2026-09-10');

		const unpaid = await hr.post(`/invoices/${draft.id}/unpaid`);
		expect(unpaid.body.status).toBe('issued');

		const list = await hr.get(`/invoices?client=${client.id}`);
		expect(list.status).toBe(200);
		expect(list.body.items.map((row: { id: string }) => row.id)).toContain(draft.id);
	});

	it('refuses to issue a reverse-charge invoice without a seller vat id', async () => {
		// § 14a Abs. 1 UStG: reverse charge needs both vat ids, the seller's billing profile has none here
		const client = await newClient('Voisin SARL');
		await hr.patch(`/clients/${client.id}`, { countryCode: 'FR', isBusiness: true, vatId: 'FR12345678901' });
		await api.superuser.query(`update app.clients set invoice_format = 'pdf' where id = $1`, [client.id]);
		const project = await billedProject(client.id, '9000');
		await bookTime('2026-09-05T09:00:00+02:00', '2026-09-05T10:00:00+02:00', project.id);
		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-05', to: '2026-09-05' })
		).body;
		expect(draft.blockers).toContain('vat_id_missing');

		const refused = await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });
		expect(refused.status).toBe(409);
		expect(refused.body.code).toBe('INVALID_STATE');
		expect(refused.body.details.blockers).toEqual(draft.blockers);
	});

	it('cancels an issued invoice with a new, negative cancellation and frees its time', async () => {
		const client = await newClient('Storno KG');
		const project = await billedProject(client.id, '5000');
		await bookTime('2026-09-06T09:00:00+02:00', '2026-09-06T11:00:00+02:00', project.id);
		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-06', to: '2026-09-06' })
		).body;
		const issued = await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });

		const cancelled = await admin.post(`/invoices/${issued.body.id}/cancel`, {
			reason: 'Kunde storniert laut Absprache vom 10.09.'
		});
		expect(cancelled.status).toBe(200);
		expect(cancelled.body.kind).toBe('cancellation');
		expect(cancelled.body.refersTo.id).toBe(issued.body.id);
		expect(cancelled.body.totals.grossCents).toBe(`-${issued.body.totals.grossCents}`);
		expect(JSON.stringify(cancelled.body).toLowerCase()).not.toContain('gutschrift');

		const original = await hr.get(`/invoices/${issued.body.id}`);
		expect(original.body.status).toBe('cancelled');

		// storno frees the booked time, a new draft over the same period picks it up again
		const again = await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-06', to: '2026-09-06' });
		expect(again.status).toBe(201);
	});

	it('leaves the pdf content out of a stored document audit row', async () => {
		const client = await newClient('Beleg KG');
		const project = await billedProject(client.id, '6000');
		await bookTime('2026-09-11T09:00:00+02:00', '2026-09-11T11:00:00+02:00', project.id);
		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-11', to: '2026-09-11' })
		).body;
		const issued = await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });
		expect(issued.status).toBe(200);

		const { rows } = await api.superuser.query(
			`select diff from audit.log where source = 'trigger' and table_name = 'invoice_documents'
			 and row_id = (select id from app.invoice_documents where tenant_id = $1 and invoice_id = $2)`,
			[tenant, issued.body.id]
		);
		expect(rows).toHaveLength(1);
		expect(Object.keys(rows[0].diff)).not.toContain('content');
		expect(JSON.stringify(rows[0].diff)).not.toContain('%PDF');
	});
});

describe('another tenant', () => {
	it('reaches nothing of this invoice through an id', async () => {
		const client = await newClient('Nachbar Rechnungs KG');
		const project = await billedProject(client.id, '7000');
		await bookTime('2026-09-09T09:00:00+02:00', '2026-09-09T11:00:00+02:00', project.id);
		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-09', to: '2026-09-09' })
		).body;
		const issued = await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });
		expect(issued.status).toBe(200);

		const other = await createTenant();
		const stranger = await signedIn(api, (await createPerson(other, { role: 'admin' })).userId, {
			reauth: true
		});
		const routes: [string, () => Promise<{ status: number }>][] = [
			['GET invoice', () => stranger.get(`/invoices/${issued.body.id}`)],
			['PATCH invoice', () => stranger.patch(`/invoices/${issued.body.id}`, { introText: 'Fremd' })],
			['GET document', () => stranger.get(`/invoices/${issued.body.id}/document`)]
		];
		for (const [route, send] of routes) {
			expect({ route, status: (await send()).status }).toEqual({ route, status: 404 });
		}
	});
});

describe('documents', () => {
	it('renders a watermarked preview for a draft and stores the real document once issued', async () => {
		const client = await newClient('Dokument KG');
		const project = await billedProject(client.id, '6000');
		await bookTime('2026-09-07T09:00:00+02:00', '2026-09-07T11:00:00+02:00', project.id);
		const draft = (
			await hr.post('/invoices/drafts', { clientId: client.id, from: '2026-09-07', to: '2026-09-07' })
		).body;

		const preview = await hr.get(`/invoices/${draft.id}/preview.pdf`);
		expect(preview.status).toBe(200);
		expect(preview.headers['content-type']).toContain('application/pdf');
		expect(preview.headers['content-security-policy']).toContain("frame-ancestors 'self'");

		const issued = await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });
		expect(issued.status).toBe(200);

		const document = await hr.get(`/invoices/${issued.body.id}/document`);
		expect(document.status).toBe(200);
		expect(document.headers['content-type']).toContain('application/pdf');
		expect(document.headers['etag']).toEqual(expect.any(String));
		expect(document.headers['content-disposition']).toContain(issued.body.number);

		// the stored original is served again, never rendered a second time
		const again = await hr.get(`/invoices/${issued.body.id}/document`);
		expect(again.headers['etag']).toBe(document.headers['etag']);
	});
});
