import type { Invoice, TaxCategory } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import {
	invoiceFixture,
	invoiceLineFixture,
	taxGroupFixture
} from '../../src/documents/invoice.fixture';
import { einvoiceBlockers } from '../../src/einvoice/blockers';
import { renderXRechnung, type EInvoice, type Treatment } from '../../src/einvoice/einvoice';
import { toEInvoice } from '../../src/einvoice/from-invoice';

const plain = invoiceFixture();

const standard = invoiceFixture({
	seller: { ...plain.seller, contactPhone: '0221 4710-318' },
	buyer: {
		...plain.buyer,
		email: 'buchhaltung@nordlicht.example',
		buyerReference: 'PO-2026-118'
	}
});

const book = invoiceLineFixture({
	id: '66666666-6666-6666-6666-666666666666',
	position: 2,
	kind: 'item',
	projectId: null,
	description: 'Fachbuch "Barrierefreie Webanwendungen"',
	serviceFrom: null,
	serviceTo: null,
	minutes: null,
	quantityMilli: '2000',
	unit: 'C62',
	unitPriceCents: '3990',
	netCents: '7980',
	taxCategory: 'reduced',
	taxRateBp: 700,
	derivation: { entries: [], rounding: null, rate: null }
});

const mixed: Invoice = {
	...standard,
	lines: [invoiceLineFixture(), book],
	taxGroups: [
		taxGroupFixture(),
		taxGroupFixture({ taxCategory: 'reduced', taxRateBp: 700, netCents: '7980', taxCents: '559' })
	],
	totals: { ...standard.totals, netCents: '83980', taxCents: '14999', grossCents: '98979' }
};

const untaxed = (taxCategory: TaxCategory, overrides: Partial<Invoice> = {}): Invoice => ({
	...standard,
	lines: [invoiceLineFixture({ taxCategory, taxRateBp: 0 })],
	taxGroups: [taxGroupFixture({ taxCategory, taxRateBp: 0, taxCents: '0' })],
	totals: { ...standard.totals, taxCents: '0', grossCents: '76000' },
	...overrides
});

const smallBusiness = untaxed('small_business', {
	taxProfile: 'small_business',
	seller: { ...standard.seller, vatId: null }
});

const reverseCharge = untaxed('reverse_charge', {
	locale: 'en',
	buyer: {
		...standard.buyer,
		name: 'Van Dijk Media B.V.',
		street: 'Keizersgracht 221',
		postalCode: '1016 DV',
		city: 'Amsterdam',
		countryCode: 'NL',
		vatId: 'NL853746291B01'
	}
});

const thirdCountry = untaxed('outside_scope', {
	buyer: {
		...standard.buyer,
		name: 'Alpenblick Software AG',
		street: 'Bahnhofstrasse 21',
		postalCode: '8001',
		city: 'Zürich',
		countryCode: 'CH',
		vatId: 'CHE-123.456.789 MWST'
	}
});

const exempt = untaxed('exempt');

const partlyExempt: Invoice = {
	...mixed,
	lines: [invoiceLineFixture(), { ...book, taxCategory: 'exempt', taxRateBp: 0 }],
	taxGroups: [
		taxGroupFixture(),
		taxGroupFixture({ taxCategory: 'exempt', taxRateBp: 0, netCents: '7980', taxCents: '0' })
	],
	totals: { ...standard.totals, netCents: '83980', taxCents: '14440', grossCents: '98420' }
};

const minus = (cents: string) => String(0n - BigInt(cents));

const cancellation: Invoice = {
	...mixed,
	id: '77777777-7777-7777-7777-777777777777',
	kind: 'cancellation',
	refersTo: { id: mixed.id, number: mixed.number, issueDate: mixed.issueDate },
	number: 'RE-2026-0009',
	numberSeq: 9,
	issueDate: '2026-09-10',
	dueDate: '2026-09-24',
	lines: mixed.lines.map((line) => ({
		...line,
		minutes: line.minutes === null ? null : 0 - line.minutes,
		quantityMilli: line.quantityMilli === null ? null : minus(line.quantityMilli),
		netCents: minus(line.netCents)
	})),
	taxGroups: mixed.taxGroups.map((group) => ({
		...group,
		netCents: minus(group.netCents),
		taxCents: minus(group.taxCents)
	})),
	totals: {
		...mixed.totals,
		netCents: minus(mixed.totals.netCents),
		taxCents: minus(mixed.totals.taxCents),
		grossCents: minus(mixed.totals.grossCents)
	}
};

const draft: Invoice = {
	...standard,
	status: 'draft',
	number: null,
	numberYear: null,
	numberSeq: null,
	issueDate: null,
	dueDate: null,
	issuedAt: null,
	issuedBy: null,
	retainUntil: null
};

describe('toEInvoice', () => {
	it('maps a 19 % invoice with seller, buyer, time line and totals', () => {
		const einvoice = toEInvoice(standard);
		expect(einvoice).toMatchObject({
			kind: 'invoice',
			number: 'RE-2026-0007',
			locale: 'de',
			treatment: 'regular',
			exemptionReason: null
		});
		expect(
			[einvoice.issueDate, einvoice.dueDate, einvoice.serviceFrom, einvoice.serviceTo].map(String)
		).toEqual(['2026-09-01', '2026-09-15', '2026-08-01', '2026-08-31']);
		expect(einvoice.seller).toEqual({
			legalName: 'Lena Vogt – Softwareentwicklung',
			street: 'Musterweg 1',
			postalCode: '40210',
			city: 'Düsseldorf',
			countryCode: 'DE',
			vatId: 'DE123456789',
			taxNumber: '123/4567/8901',
			iban: 'DE79000000001234567890',
			bic: 'BEISDEF0XXX',
			contactName: 'Lena Vogt',
			contactEmail: 'lena@example.test',
			contactPhone: '0221 4710-318',
			registerCourt: null,
			registerNumber: null
		});
		expect(einvoice.buyer).toEqual({
			name: 'Agentur Nordlicht GmbH',
			street: 'Hafenstraße 12',
			postalCode: '20359',
			city: 'Hamburg',
			countryCode: 'DE',
			vatId: 'DE987654321',
			email: 'buchhaltung@nordlicht.example',
			buyerReference: 'PO-2026-118'
		});
		const [hours] = einvoice.lines;
		expect(hours).toMatchObject({
			description: 'Relaunch Website, Umsetzung Startseite',
			quantity: { minutes: 480 },
			unitPriceCents: 9500n,
			netCents: 76000n,
			taxCategory: 'standard',
			taxRateBp: 1900
		});
		expect([hours?.serviceFrom, hours?.serviceTo].map(String)).toEqual([
			'2026-08-01',
			'2026-08-31'
		]);
		expect(einvoice.totals).toEqual({
			groups: [{ taxCategory: 'standard', taxRateBp: 1900, netCents: 76000n, taxCents: 14440n }],
			netCents: 76000n,
			taxCents: 14440n,
			grossCents: 90440n
		});
	});

	it('keeps 7 % next to 19 % regular and reads a free position in thousandths', () => {
		const einvoice = toEInvoice(mixed);
		expect(einvoice.treatment).toBe('regular');
		expect(einvoice.lines[1]).toEqual({
			description: 'Fachbuch "Barrierefreie Webanwendungen"',
			serviceFrom: null,
			serviceTo: null,
			quantity: { milli: 2000n, unit: 'C62' },
			unitPriceCents: 3990n,
			netCents: 7980n,
			taxCategory: 'reduced',
			taxRateBp: 700
		});
		expect(einvoice.totals.groups).toEqual([
			{ taxCategory: 'standard', taxRateBp: 1900, netCents: 76000n, taxCents: 14440n },
			{ taxCategory: 'reduced', taxRateBp: 700, netCents: 7980n, taxCents: 559n }
		]);
		expect(einvoice.totals.grossCents).toBe(98979n);
	});

	it.each<[string, Invoice, Treatment]>([
		['19 %', standard, 'regular'],
		['19 % and 7 %', mixed, 'regular'],
		['a small business', smallBusiness, 'small_business'],
		['reverse charge', reverseCharge, 'reverse_charge'],
		['a supply outside the scope of German VAT', thirdCountry, 'outside_scope'],
		['only exempt positions', exempt, 'exempt'],
		['an exempt position next to a taxed one', partlyExempt, 'regular']
	])('derives the treatment for %s', (_name, invoice, treatment) => {
		expect(toEInvoice(invoice).treatment).toBe(treatment);
	});

	it('passes the locale of an English reverse charge invoice through', () => {
		expect(toEInvoice(reverseCharge).locale).toBe('en');
	});

	it('has no exemption reason to offer, exempt positions stay blocked', () => {
		expect(toEInvoice(partlyExempt).exemptionReason).toBeNull();
		expect(einvoiceBlockers(toEInvoice(partlyExempt), 'zugferd')).toEqual([
			'exemption_reason_missing'
		]);
		expect(einvoiceBlockers(toEInvoice(exempt), 'zugferd')).toEqual(['exemption_reason_missing']);
	});

	it('keeps the stored negative amounts of a cancellation and points it at the original', () => {
		const einvoice = toEInvoice(cancellation) as Extract<EInvoice, { kind: 'cancellation' }>;
		expect(einvoice).toMatchObject({
			kind: 'cancellation',
			number: 'RE-2026-0009',
			cancels: { number: 'RE-2026-0007' }
		});
		expect(String(einvoice.cancels.issueDate)).toBe('2026-09-01');
		expect(einvoice.lines.map((line) => line.quantity)).toEqual([
			{ minutes: -480 },
			{ milli: -2000n, unit: 'C62' }
		]);
		expect(einvoice.lines.map((line) => [line.unitPriceCents, line.netCents])).toEqual([
			[9500n, -76000n],
			[3990n, -7980n]
		]);
		expect(einvoice.totals).toEqual({
			groups: [
				{ taxCategory: 'standard', taxRateBp: 1900, netCents: -76000n, taxCents: -14440n },
				{ taxCategory: 'reduced', taxRateBp: 700, netCents: -7980n, taxCents: -559n }
			],
			netCents: -83980n,
			taxCents: -14999n,
			grossCents: -98979n
		});
	});

	it('refuses a cancellation without an issued original', () => {
		expect(() => toEInvoice({ ...cancellation, refersTo: null })).toThrow(
			'does not point to an issued invoice'
		);
		const unissued = { ...cancellation, refersTo: { id: mixed.id, number: null, issueDate: null } };
		expect(() => toEInvoice(unissued)).toThrow('does not point to an issued invoice');
	});

	it('fills number and dates of a draft with placeholders the check before numbering accepts', () => {
		const einvoice = toEInvoice(draft);
		expect(einvoice.number).toBe('ENTWURF');
		expect([einvoice.issueDate, einvoice.dueDate].map(String)).toEqual([
			'2026-08-31',
			'2026-09-14'
		]);
		expect(einvoiceBlockers(einvoice, 'xrechnung')).toEqual([]);
		expect(einvoiceBlockers(einvoice, 'zugferd')).toEqual([]);
	});

	it('never puts a placeholder on an issued invoice', () => {
		expect(() => toEInvoice({ ...standard, number: null })).toThrow(
			'is issued without number or dates'
		);
		expect(() => toEInvoice({ ...cancellation, status: 'paid', dueDate: null })).toThrow(
			'is paid without number or dates'
		);
	});

	it('carries the specimen flag of a sandbox invoice over (X-01)', () => {
		expect(toEInvoice(standard).specimen).toBe(false);
		expect(toEInvoice({ ...standard, specimen: true }).specimen).toBe(true);
	});
});

describe('a complete model', () => {
	it.each<[string, Invoice]>([
		['19 %', standard],
		['19 % and 7 %', mixed],
		['a small business', smallBusiness],
		['reverse charge', reverseCharge],
		['a supply outside the scope of German VAT', thirdCountry],
		['a cancellation', cancellation]
	])('runs through the blockers for %s without a finding', (_name, invoice) => {
		expect(einvoiceBlockers(toEInvoice(invoice), 'xrechnung')).toEqual([]);
		expect(einvoiceBlockers(toEInvoice(invoice), 'zugferd')).toEqual([]);
	});

	it('renders an XRechnung', async () => {
		const xml = await renderXRechnung(toEInvoice(standard));
		expect(xml).toContain('<rsm:CrossIndustryInvoice');
		expect(xml).toContain('<ram:ID>RE-2026-0007</ram:ID>');
		expect(xml).toContain('<ram:BilledQuantity unitCode="MIN">480.000</ram:BilledQuantity>');
		expect(xml).toContain('<ram:DuePayableAmount>904.40</ram:DuePayableAmount>');
	});

	it('renders the cancellation as a credit note with number and date of the original', async () => {
		const xml = await renderXRechnung(toEInvoice(cancellation));
		expect(xml).toContain('<ram:TypeCode>381</ram:TypeCode>');
		expect(xml).toMatch(
			/<ram:IssuerAssignedID>RE-2026-0007<\/ram:IssuerAssignedID>\s*<ram:FormattedIssueDateTime>\s*<qdt:DateTimeString format="102">20260901</
		);
		expect(xml).toContain('<ram:DuePayableAmount>989.79</ram:DuePayableAmount>');
		expect(xml).not.toMatch(/>-\d/);
	});

	it('keeps the German reverse charge wording on the English XRechnung', async () => {
		const xml = await renderXRechnung(toEInvoice(reverseCharge));
		expect(xml).toContain('Steuerschuldnerschaft des Leistungsempfängers / Reverse charge');
	});
});
