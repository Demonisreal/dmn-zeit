import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { roundDiv } from '@zeit/rules';
import type { BillingProfile, Invoice } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { buildInvoicePdf } from '../../src/documents/pdf';
import { renderXRechnung } from '../../src/einvoice/einvoice';
import { toEInvoice } from '../../src/einvoice/from-invoice';
import { TEXTS } from '../../src/einvoice/texts';
import {
	liveBuyer,
	liveSeller,
	toInvoiceModel,
	type ClientRowForInvoice,
	type InvoiceLineRowDb,
	type InvoiceRowDb
} from '../../src/invoices/drafts';

const flat = (raw: string) => raw.replace(/\s+/g, ' ').trim();

const profile: BillingProfile = {
	legalName: 'Mira Beispiel Softwareentwicklung',
	street: 'Lindenweg 4',
	postalCode: '04109',
	city: 'Leipzig',
	countryCode: 'DE',
	taxNumber: '231/5123/4567',
	vatId: 'DE123456789',
	taxProfile: 'regular',
	previousYearRevenueCents: null,
	iban: 'DE79000000001234567890',
	bic: 'BEISDEF0XXX',
	bankName: 'Musterbank',
	contactName: 'Mira Beispiel',
	contactEmail: 'rechnung@mira-beispiel.example',
	contactPhone: '0221 4710-318',
	registerCourt: null,
	registerNumber: null,
	invoicePrefix: '',
	paymentTermsDays: 14,
	roundingIncrementMin: 15,
	roundingMode: 'up',
	defaultFormat: 'xrechnung'
};

const kranich: ClientRowForInvoice = {
	name: 'Kranich Logistik GmbH',
	street: 'Hafenstraße 12',
	postal_code: '20457',
	city: 'Hamburg',
	country_code: 'DE',
	is_business: true,
	vat_id: 'DE987654321',
	email: 'buchhaltung@kranich-logistik.example',
	buyer_reference: 'PO-2026-118',
	number: 'K-0042'
};

const vanDijk: ClientRowForInvoice = {
	...kranich,
	name: 'Van Dijk Media B.V.',
	street: 'Keizersgracht 221',
	postal_code: '1016 DV',
	city: 'Amsterdam',
	country_code: 'NL',
	vat_id: 'NL853746291B01'
};

const alpenblick: ClientRowForInvoice = {
	...kranich,
	name: 'Alpenblick Software AG',
	street: 'Bahnhofstrasse 21',
	postal_code: '8001',
	city: 'Zürich',
	country_code: 'CH',
	vat_id: 'CHE-123.456.789 MWST'
};

const hours = (
	minutes: number,
	tax_category: InvoiceLineRowDb['tax_category'],
	tax_rate_bp: number,
	sign = 1
): InvoiceLineRowDb => ({
	id: '11111111-1111-4111-8111-111111111111',
	position: 1,
	kind: 'time',
	project_id: '22222222-2222-4222-8222-222222222222',
	task_id: null,
	description: 'Entwicklung Sendungsverfolgung',
	service_from: '2026-08-03',
	service_to: '2026-08-28',
	minutes: sign * minutes,
	quantity_milli: null,
	unit: null,
	unit_price_cents: '9500',
	net_cents: String(BigInt(sign) * roundDiv(BigInt(minutes) * 9500n, 60n)),
	tax_category,
	tax_rate_bp,
	exemption_reason: null,
	derivation: null
});

const row = (over: Partial<InvoiceRowDb>): InvoiceRowDb => ({
	id: '33333333-3333-4333-8333-333333333333',
	kind: 'invoice',
	status: 'issued',
	specimen: false,
	client_id: '44444444-4444-4444-8444-444444444444',
	number: '2026-0012',
	number_year: 2026,
	number_seq: 12,
	issue_date: '2026-09-04',
	due_date: '2026-09-18',
	service_from: '2026-08-03',
	service_to: '2026-08-28',
	payment_terms_days: 14,
	locale: 'de',
	format: 'xrechnung',
	tax_profile: 'regular',
	tax_treatment: null,
	seller: null,
	buyer: null,
	intro_text: null,
	closing_text: null,
	paid_on: null,
	cancel_reason: null,
	cancelled_at: null,
	cancelled_by: null,
	issued_at: '2026-09-04T09:00:00+02:00',
	issued_by: null,
	created_by: null,
	created_at: '2026-09-03T09:00:00+02:00',
	updated_at: '2026-09-04T09:00:00+02:00',
	retain_until: '2034-12-31',
	...over
});

function model(
	seller: BillingProfile,
	client: ClientRowForInvoice,
	line: InvoiceLineRowDb,
	over: Partial<InvoiceRowDb> = {},
	refersTo: Invoice['refersTo'] = null
): Invoice {
	const invoice = row({
		tax_profile: seller.taxProfile,
		seller: liveSeller(seller),
		buyer: liveBuyer(client),
		...over
	});
	return toInvoiceModel({ invoice, lines: [line], client, profile: seller, refersTo });
}

const smallBusiness: BillingProfile = {
	...profile,
	legalName: 'Jonas Kerber Webdesign',
	vatId: null,
	taxNumber: '151/234/56789',
	taxProfile: 'small_business'
};

const CASES: Record<string, Invoice> = {
	regular: model(profile, kranich, hours(2250, 'standard', 1900)),
	'reverse charge de': model(profile, vanDijk, hours(1920, 'reverse_charge', 0)),
	'reverse charge en': model(profile, vanDijk, hours(1920, 'reverse_charge', 0), { locale: 'en' }),
	'small business': model(
		smallBusiness,
		{ ...kranich, vat_id: null },
		hours(720, 'small_business', 0)
	),
	'third country': model(profile, alpenblick, hours(960, 'outside_scope', 0)),
	cancellation: model(
		profile,
		kranich,
		hours(2250, 'standard', 1900, -1),
		{ kind: 'cancellation', number: '2026-0019', issue_date: '2026-09-11', due_date: '2026-09-25' },
		{ id: '55555555-5555-4555-8555-555555555555', number: '2026-0012', issueDate: '2026-09-04' }
	)
};

const contents = (xml: string, tag: string) =>
	[...xml.matchAll(new RegExp(`<ram:${tag}>([^<]*)</ram:${tag}>`, 'g'))].map(([, text]) => text!);

async function render(invoice: Invoice) {
	const [{ text }, xml] = await Promise.all([
		buildInvoicePdf(invoice).then((pdf) => pdfParse(pdf)),
		renderXRechnung(toEInvoice(invoice))
	]);
	return { pdf: flat(text), xml };
}

describe.each(Object.entries(CASES))('%s', (_, invoice) => {
	it('prints every XML note and exemption reason in the PDF as well', async () => {
		const { pdf, xml } = await render(invoice);
		for (const note of [...contents(xml, 'Content'), ...contents(xml, 'ExemptionReason')]) {
			expect(pdf).toContain(note);
		}
	});

	it('carries every legal note of the PDF in the XML', async () => {
		const { xml } = await render(invoice);
		const notes = contents(xml, 'Content');
		for (const note of invoice.legalNotes) {
			expect(notes).toContain(note);
		}
	});
});

describe('wording', () => {
	it('names no § 13b UStG for an EU business, in neither document', async () => {
		for (const invoice of [CASES['reverse charge de']!, CASES['reverse charge en']!]) {
			const { pdf, xml } = await render(invoice);
			expect(pdf).toContain(TEXTS[invoice.locale].reverseCharge);
			expect(pdf).not.toContain('13b');
			expect(xml).not.toContain('13b');
		}
	});

	it('keeps the german legal term next to the english one', async () => {
		const { pdf } = await render(CASES['reverse charge en']!);
		expect(pdf).toContain('Steuerschuldnerschaft des Leistungsempfängers / Reverse charge');
	});

	it('writes an english date the same way in both documents', async () => {
		const { pdf, xml } = await render(CASES['reverse charge en']!);
		const [terms] = contents(xml, 'Description');
		expect(terms).toBe('Payable without deduction by 18 September 2026.');
		expect(pdf).toContain('18 September 2026');
		expect(pdf).toContain('4 September 2026');
	});

	it('leaves the seller vat id off a third country invoice, as BR-O-2 does in the XML', async () => {
		const { pdf, xml } = await render(CASES['third country']!);
		expect(xml).not.toContain('DE123456789');
		expect(pdf).not.toContain('DE123456789');
		expect(pdf).toContain('Steuernummer: 231/5123/4567');
		expect(pdf).toContain(TEXTS.de.outsideScope);
	});

	it('shows a regular invoice without any note in either document', async () => {
		const { xml } = await render(CASES.regular!);
		expect(contents(xml, 'Content')).toEqual([]);
		expect(CASES.regular!.legalNotes).toEqual([]);
	});
});

describe('cancellation', () => {
	it('refers to the original by number and date in both documents', async () => {
		const { pdf, xml } = await render(CASES.cancellation!);
		const reference = 'storniert Rechnung 2026-0012 vom 04.09.2026';
		expect(contents(xml, 'Content')).toEqual([reference]);
		expect(pdf).toContain(reference);
	});

	it('prints negative amounts while the XML carries a 381 with positive ones (adr 0004)', async () => {
		const { pdf, xml } = await render(CASES.cancellation!);
		expect(xml).toContain('<ram:TypeCode>381</ram:TypeCode>');
		expect(contents(xml, 'GrandTotalAmount')).toEqual(['4239.38']);
		expect(pdf).toContain('-4.239,38 €');
	});

	it('asks for no payment: no due date, no bank details', async () => {
		const { pdf } = await render(CASES.cancellation!);
		expect(pdf).not.toContain('Zahlbar');
		expect(pdf).not.toContain('Fällig');
		expect(pdf).not.toContain('IBAN');
	});
});
