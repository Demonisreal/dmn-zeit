import { createHash } from 'node:crypto';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DocumentsService } from '../../src/documents/documents.service';
import { startApi, type Api } from '../auth/api';
import { embeddedInvoice } from '../einvoice/fixtures';
import { signedIn, type Desk } from '../helpers/desk';
import { createPerson, createTenant, type Person } from '../helpers/pg';

vi.mock('../../src/documents/worker', async (importOriginal) => {
	const worker = await importOriginal<typeof import('../../src/documents/worker')>();
	return { ...worker, renderInWorker: worker.renderJob };
});

const LEITWEG_ID = '04011000-12345-03';

const seller = {
	legalName: 'Lena Vogt Softwareentwicklung',
	street: 'Musterweg 1',
	postalCode: '40210',
	city: 'Düsseldorf',
	taxNumber: '123/4567/8901',
	vatId: 'DE123456789',
	previousYearRevenueCents: null,
	iban: 'DE79000000001234567890',
	bic: 'BEISDEF0XXX',
	bankName: 'Musterbank',
	contactName: 'Lena Vogt',
	contactEmail: 'rechnung@vogt.example',
	contactPhone: '0221 4710-318',
	registerCourt: null,
	registerNumber: null
};

let api: Api;
let tenant: string;
let hr: Desk;
let admin: Desk;
let worker: Person;
let nextDay = 1;

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	hr = await signedIn(api, (await createPerson(tenant, { role: 'hr' })).userId);
	admin = await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId, {
		reauth: true
	});
	worker = await createPerson(tenant);
	expect((await admin.patch('/billing/profile', seller)).status).toBe(200);
});

afterAll(() => api.app.close());

function raw(test: request.Test) {
	return test.buffer(true).parse((res, done) => {
		const chunks: Buffer[] = [];
		res.on('data', (chunk: Buffer) => chunks.push(chunk));
		res.on('end', () => done(null, Buffer.concat(chunks)));
	});
}

async function newClient(desk: Desk, fields: Record<string, unknown>) {
	const answer = await desk.post('/clients', {
		street: 'Hafenstraße 12',
		postalCode: '20359',
		city: 'Hamburg',
		email: 'rechnung@kunde.example',
		...fields
	});
	expect(answer.status).toBe(201);
	return answer.body.id as string;
}

async function draftFor(desk: Desk, booker: Person, clientId: string) {
	const project = (await desk.post('/projects', { clientId, name: 'Website' })).body;
	await desk.post('/rates', { clientId, validFrom: '2026-01-01', rateCents: '9000' });
	const day = `2026-09-${String(nextDay++).padStart(2, '0')}`;
	const booked = await (
		await signedIn(api, booker.userId)
	).post('/project-entries', {
		projectId: project.id,
		startedAt: `${day}T09:00:00+02:00`,
		endedAt: `${day}T12:00:00+02:00`,
		note: 'Umsetzung'
	});
	expect(booked.status).toBe(201);
	const draft = await desk.post('/invoices/drafts', { clientId, from: day, to: day });
	expect(draft.status).toBe(201);
	return draft.body;
}

async function issued(format: string, client: Record<string, unknown>) {
	const draft = await draftFor(hr, worker, await newClient(hr, client));
	const answer = await admin.post(`/invoices/${draft.id}/issue`, { format });
	expect(answer.status).toBe(200);
	return answer.body;
}

async function storedFormats(invoiceId: string) {
	const { rows } = await api.superuser.query<{ format: string }>(
		'select format from app.invoice_documents where invoice_id = $1 order by format',
		[invoiceId]
	);
	return rows.map((row) => row.format);
}

const etagOf = (content: Buffer) => `"${createHash('sha256').update(content).digest('hex')}"`;

describe('issuing per format', () => {
	it('stores only the pdf of a plain pdf invoice and has no xml for it', async () => {
		const invoice = await issued('pdf', { name: 'Papier KG', isBusiness: false });
		expect(invoice.format).toBe('pdf');
		expect(await storedFormats(invoice.id)).toEqual(['pdf']);

		const document = await raw(hr.get(`/invoices/${invoice.id}/document`));
		expect(document.status).toBe(200);
		expect(document.headers['content-type']).toBe('application/pdf');
		expect(document.headers['content-disposition']).toBe(
			`inline; filename="Rechnung-${invoice.number}.pdf"`
		);
		expect(document.headers['content-security-policy']).toBe(
			"default-src 'none'; frame-ancestors 'self'"
		);
		expect(document.headers['x-frame-options']).toBe('SAMEORIGIN');
		expect(document.headers['etag']).toBe(etagOf(document.body));
		expect(document.body.subarray(0, 5).toString()).toBe('%PDF-');

		expect((await hr.get(`/invoices/${invoice.id}/xml`)).status).toBe(404);
	});

	it('embeds factur-x.xml into a PDF/A-3 for zugferd, named in the language of the client', async () => {
		const draft = await draftFor(
			hr,
			worker,
			await newClient(hr, { name: 'Nordlicht Ltd', invoiceLocale: 'en' })
		);
		expect(draft.format).toBe('zugferd');
		const invoice = (await admin.post(`/invoices/${draft.id}/issue`, { format: 'zugferd' })).body;
		expect(invoice.format).toBe('zugferd');
		expect(await storedFormats(invoice.id)).toEqual(['zugferd']);

		const document = await raw(hr.get(`/invoices/${invoice.id}/document`));
		expect(document.status).toBe(200);
		expect(document.headers['content-type']).toBe('application/pdf');
		expect(document.headers['content-disposition']).toBe(
			`inline; filename="Invoice-${invoice.number}.pdf"`
		);
		const pdf = document.body.toString('latin1');
		expect(pdf).toContain('factur-x.xml');
		expect(pdf).toContain('<pdfaid:part>3</pdfaid:part>');
		expect(pdf).toContain('<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>');
		expect(embeddedInvoice(document.body)).toContain(`<ram:ID>${invoice.number}</ram:ID>`);

		expect((await hr.get(`/invoices/${invoice.id}/xml`)).status).toBe(404);
	});

	it('keeps the xrechnung xml byte for byte and serves a readable pdf next to it', async () => {
		const draft = await draftFor(
			hr,
			worker,
			await newClient(hr, { name: 'Stadt Lindental', buyerReference: LEITWEG_ID })
		);
		expect(draft.format).toBe('xrechnung');
		expect(draft.blockers).toEqual([]);
		const invoice = (await admin.post(`/invoices/${draft.id}/issue`, { format: 'xrechnung' })).body;
		expect(await storedFormats(invoice.id)).toEqual(['pdf', 'xrechnung_cii']);

		const xml = await raw(hr.get(`/invoices/${invoice.id}/xml`));
		expect(xml.status).toBe(200);
		expect(xml.headers['content-type']).toBe('application/xml; charset=utf-8');
		expect(xml.headers['content-disposition']).toBe(
			`attachment; filename="Rechnung-${invoice.number}.xml"`
		);
		expect(xml.headers['etag']).toBe(etagOf(xml.body));
		const text = xml.body.toString('utf8');
		expect(text).toContain('<rsm:CrossIndustryInvoice');
		expect(text).toContain('urn:xeinkauf.de:kosit:xrechnung_3.0');
		expect(text).toContain(`<ram:ID>${invoice.number}</ram:ID>`);
		expect(text).toContain(LEITWEG_ID);

		const again = await raw(hr.get(`/invoices/${invoice.id}/xml`));
		expect(again.headers['etag']).toBe(xml.headers['etag']);
		expect(again.body.equals(xml.body)).toBe(true);
		const { rows } = await api.superuser.query<{ content: Buffer }>(
			`select content from app.invoice_documents where invoice_id = $1 and format = 'xrechnung_cii'`,
			[invoice.id]
		);
		expect(rows[0]!.content.equals(xml.body)).toBe(true);

		const copy = await raw(hr.get(`/invoices/${invoice.id}/document`));
		expect(copy.status).toBe(200);
		expect(copy.headers['content-type']).toBe('application/pdf');
		expect(copy.headers['content-disposition']).toBe(
			`inline; filename="Rechnung-${invoice.number}.pdf"`
		);
		expect(copy.body.toString('latin1')).not.toContain('factur-x.xml');
	});
});

describe('tax exempt position', () => {
	it('carries its reason into the zugferd xml as BT-120 and into the pdf note', async () => {
		const draft = await draftFor(hr, worker, await newClient(hr, { name: 'Lehrgang GmbH' }));
		const fee = {
			description: 'Prüfungsgebühr',
			quantityMilli: '1000',
			unit: 'LS',
			unitPriceCents: '15000',
			taxCategory: 'exempt'
		};
		const reason = 'Steuerfrei nach § 4 Nr. 21 UStG';
		const added = await hr.post(`/invoices/${draft.id}/lines`, { ...fee, exemptionReason: reason });
		expect(added.status).toBe(201);
		expect((await hr.get(`/invoices/${draft.id}`)).body.blockers).not.toContain(
			'exemption_reason_missing'
		);

		const invoice = await admin.post(`/invoices/${draft.id}/issue`, { format: 'zugferd' });
		expect(invoice.status).toBe(200);
		expect(invoice.body.legalNotes).toContain(`Umsatzsteuerbefreiung: ${reason}`);

		const document = await raw(hr.get(`/invoices/${invoice.body.id}/document`));
		expect(document.status).toBe(200);
		const xml = embeddedInvoice(document.body);
		expect(xml).toContain(`<ram:ExemptionReason>${reason}</ram:ExemptionReason>`);
		expect(xml).toContain('<ram:CategoryCode>E</ram:CategoryCode>');
		const text = (await pdfParse(document.body)).text.replace(/\s+/g, ' ');
		expect(text).toContain(`Umsatzsteuerbefreiung: ${reason}`);
	});
});

describe('blockers', () => {
	it('shows the blockers of the stored format on the draft and still lets the issue pick another', async () => {
		const clientId = await newClient(hr, { name: 'Amt ohne Leitweg-ID' });
		await api.superuser.query(`update app.clients set invoice_format = 'xrechnung' where id = $1`, [
			clientId
		]);
		const draft = await draftFor(hr, worker, clientId);
		expect(draft.format).toBe('xrechnung');
		expect(draft.blockers).toEqual(['buyer_reference_missing']);

		const answer = await admin.post(`/invoices/${draft.id}/issue`, { format: 'zugferd' });
		expect(answer.status).toBe(200);
		expect(answer.body.format).toBe('zugferd');
		expect(answer.body.blockers).toEqual([]);
	});

	it('refuses before the number is taken and leaves the counter alone', async () => {
		const counter = async () => {
			const { rows } = await api.superuser.query<{ seq: number }>(
				'select coalesce(max(last_seq), 0) as seq from app.invoice_counters where tenant_id = $1',
				[tenant]
			);
			return Number(rows[0]!.seq);
		};
		const draft = await draftFor(hr, worker, await newClient(hr, { name: 'Ohne Leitweg GmbH' }));
		expect(draft.format).toBe('zugferd');
		const before = await counter();

		const refused = await admin.post(`/invoices/${draft.id}/issue`, { format: 'xrechnung' });
		expect(refused.status).toBe(409);
		expect(refused.body.code).toBe('INVALID_STATE');
		expect(refused.body.details.blockers).toEqual(['buyer_reference_missing']);
		expect(await counter()).toBe(before);

		const still = (await hr.get(`/invoices/${draft.id}`)).body;
		expect(still).toMatchObject({ status: 'draft', number: null, format: 'zugferd' });

		const answer = await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });
		expect(answer.status).toBe(200);
		expect(answer.body.numberSeq).toBe(before + 1);
	});
});

describe('cancellation', () => {
	it('cancels into a 381 cancellation in the format of the original', async () => {
		const original = await issued('xrechnung', {
			name: 'Stadtwerke Storno',
			buyerReference: LEITWEG_ID
		});
		const cancelled = await admin.post(`/invoices/${original.id}/cancel`, {
			reason: 'Leistungszeitraum falsch, neue Rechnung folgt'
		});
		expect(cancelled.status).toBe(200);
		expect(cancelled.body).toMatchObject({ kind: 'cancellation', format: 'xrechnung' });
		expect(await storedFormats(cancelled.body.id)).toEqual(['pdf', 'xrechnung_cii']);

		const xml = await raw(hr.get(`/invoices/${cancelled.body.id}/xml`));
		expect(xml.status).toBe(200);
		expect(xml.headers['content-disposition']).toBe(
			`attachment; filename="Stornorechnung-${cancelled.body.number}.xml"`
		);
		const text = xml.body.toString('utf8');
		expect(text).toContain('<ram:TypeCode>381</ram:TypeCode>');
		expect(text).toContain(`<ram:IssuerAssignedID>${original.number}</ram:IssuerAssignedID>`);
	});
});

describe('rendering after a failed attempt', () => {
	it('renders and stores the missing document on the first download', async () => {
		vi.spyOn(api.app.get(DocumentsService), 'renderInvoice').mockRejectedValueOnce(
			new Error('worker gone')
		);
		const invoice = await issued('zugferd', { name: 'Später KG' });
		expect(invoice.status).toBe('issued');
		expect(await storedFormats(invoice.id)).toEqual([]);

		const first = await raw(hr.get(`/invoices/${invoice.id}/document`));
		expect(first.status).toBe(200);
		expect(first.body.toString('latin1')).toContain('factur-x.xml');
		expect(await storedFormats(invoice.id)).toEqual(['zugferd']);

		const again = await raw(hr.get(`/invoices/${invoice.id}/document`));
		expect(again.headers['etag']).toBe(first.headers['etag']);
	});

	it('stores the xml together with its pdf copy when only the xml is asked for', async () => {
		vi.spyOn(api.app.get(DocumentsService), 'renderInvoice').mockRejectedValueOnce(
			new Error('worker gone')
		);
		const invoice = await issued('xrechnung', { name: 'Amt Später', buyerReference: LEITWEG_ID });
		expect(await storedFormats(invoice.id)).toEqual([]);

		const xml = await raw(hr.get(`/invoices/${invoice.id}/xml`));
		expect(xml.status).toBe(200);
		expect(xml.headers['etag']).toBe(etagOf(xml.body));
		expect(await storedFormats(invoice.id)).toEqual(['pdf', 'xrechnung_cii']);
	});

	it('answers two downloads at once with the one original that got stored', async () => {
		vi.spyOn(api.app.get(DocumentsService), 'renderInvoice').mockRejectedValueOnce(
			new Error('worker gone')
		);
		const invoice = await issued('zugferd', { name: 'Gleichzeitig KG' });

		const [one, two] = await Promise.all([
			raw(hr.get(`/invoices/${invoice.id}/document`)),
			raw(hr.get(`/invoices/${invoice.id}/document`))
		]);
		expect([one.status, two.status]).toEqual([200, 200]);
		expect(two.headers['etag']).toBe(one.headers['etag']);
		expect(await storedFormats(invoice.id)).toEqual(['zugferd']);
	});
});

describe('other pdf routes', () => {
	it('sends the draft preview as pdf bytes, not as a json dump of them', async () => {
		const draft = await draftFor(hr, worker, await newClient(hr, { name: 'Vorschau KG' }));
		const preview = await raw(hr.get(`/invoices/${draft.id}/preview.pdf`));
		expect(preview.status).toBe(200);
		expect(preview.headers['content-type']).toBe('application/pdf');
		expect(preview.body.subarray(0, 5).toString()).toBe('%PDF-');
	});

	it('sends the time report of an issued invoice as pdf bytes', async () => {
		const invoice = await issued('pdf', { name: 'Stundennachweis KG' });
		const report = await raw(hr.get(`/invoices/${invoice.id}/time-report?format=pdf`));
		expect(report.status).toBe(200);
		expect(report.headers['content-type']).toBe('application/pdf');
		expect(report.body.subarray(0, 5).toString()).toBe('%PDF-');
	});
});

describe('access', () => {
	it('serves neither document nor xml of a draft', async () => {
		const draft = await draftFor(
			hr,
			worker,
			await newClient(hr, { name: 'Entwurf AG', buyerReference: LEITWEG_ID })
		);
		expect((await hr.get(`/invoices/${draft.id}/document`)).status).toBe(404);
		expect((await hr.get(`/invoices/${draft.id}/xml`)).status).toBe(404);
	});

	it('keeps another tenant out and turns a team lead away', async () => {
		const invoice = await issued('xrechnung', {
			name: 'Fremdzugriff Amt',
			buyerReference: LEITWEG_ID
		});
		const stranger = await signedIn(
			api,
			(await createPerson(await createTenant(), { role: 'admin' })).userId
		);
		expect((await stranger.get(`/invoices/${invoice.id}/xml`)).status).toBe(404);
		expect((await stranger.get(`/invoices/${invoice.id}/document`)).status).toBe(404);

		const lead = await signedIn(api, (await createPerson(tenant, { role: 'team_lead' })).userId);
		expect((await lead.get(`/invoices/${invoice.id}/xml`)).status).toBe(403);
	});

	it('issues and serves an xrechnung in a solo workspace as well', async () => {
		const owner = await createPerson(await createTenant({ workspace: 'solo' }), { role: 'admin' });
		const desk = await signedIn(api, owner.userId, { reauth: true });
		expect((await desk.patch('/billing/profile', seller)).status).toBe(200);
		const draft = await draftFor(
			desk,
			owner,
			await newClient(desk, { name: 'Solo Amt', buyerReference: LEITWEG_ID })
		);

		const invoice = await desk.post(`/invoices/${draft.id}/issue`, { format: 'xrechnung' });
		expect(invoice.status).toBe(200);
		const xml = await raw(desk.get(`/invoices/${invoice.body.id}/xml`));
		expect(xml.status).toBe(200);
		expect(xml.body.toString('utf8')).toContain(`<ram:ID>${invoice.body.number}</ram:ID>`);
	});
});
