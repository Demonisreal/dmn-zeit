import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../billing/billing.store';
import {
	toInvoiceModel,
	type ClientRowForInvoice,
	type InvoiceLineRowDb,
	type InvoiceRowDb
} from './drafts';
import { legalNoteTexts } from './texts';

const draft: InvoiceRowDb = {
	id: '33333333-3333-3333-3333-333333333333',
	kind: 'invoice',
	status: 'draft',
	specimen: false,
	client_id: '44444444-4444-4444-4444-444444444444',
	number: null,
	number_year: null,
	number_seq: null,
	issue_date: null,
	due_date: null,
	service_from: '2026-08-01',
	service_to: '2026-08-31',
	payment_terms_days: 14,
	locale: 'de',
	format: 'pdf',
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
	issued_at: null,
	issued_by: null,
	created_by: null,
	created_at: '2026-08-31T10:00:00+02:00',
	updated_at: '2026-08-31T10:00:00+02:00',
	retain_until: null
};

const client: ClientRowForInvoice = {
	name: 'Agentur Nordlicht GmbH',
	street: 'Hafenstraße 12',
	postal_code: '20359',
	city: 'Hamburg',
	country_code: 'DE',
	is_business: true,
	vat_id: null,
	email: null,
	buyer_reference: null,
	number: null
};

const consulting: InvoiceLineRowDb = {
	id: '11111111-1111-1111-1111-111111111111',
	position: 1,
	kind: 'item',
	project_id: null,
	task_id: null,
	description: 'Beratung',
	service_from: null,
	service_to: null,
	minutes: null,
	quantity_milli: '1000',
	unit: 'HUR',
	unit_price_cents: '10000',
	net_cents: '10000',
	tax_category: 'standard',
	tax_rate_bp: 1900,
	exemption_reason: null,
	derivation: null
};

const profile = { ...DEFAULT_PROFILE, legalName: 'Lena Vogt', taxNumber: '123/4567/8901' };

describe('toInvoiceModel', () => {
	it('adds the § 4 UStG note as soon as one position is tax exempt', () => {
		const exempt: InvoiceLineRowDb = {
			...consulting,
			id: '22222222-2222-2222-2222-222222222222',
			position: 2,
			description: 'Prüfungsgebühr',
			tax_category: 'exempt',
			tax_rate_bp: 0
		};
		const model = toInvoiceModel({
			invoice: draft,
			lines: [consulting, exempt],
			client,
			profile,
			refersTo: null,
			cancellation: null
		});
		expect(model.legalNotes).toEqual([legalNoteTexts.de.exempt_reason]);
	});

	it('names every distinct exemption reason once', () => {
		const exempt = (id: string, position: number, reason: string): InvoiceLineRowDb => ({
			...consulting,
			id,
			position,
			tax_category: 'exempt',
			tax_rate_bp: 0,
			exemption_reason: reason
		});
		const model = toInvoiceModel({
			invoice: draft,
			lines: [
				consulting,
				exempt('22222222-2222-2222-2222-222222222222', 2, '§ 4 Nr. 21 UStG'),
				exempt('55555555-5555-5555-5555-555555555555', 3, '§ 4 Nr. 22a UStG'),
				exempt('66666666-6666-6666-6666-666666666666', 4, '§ 4 Nr. 21 UStG')
			],
			client,
			profile,
			refersTo: null,
			cancellation: null
		});
		expect(model.legalNotes).toEqual([
			'Umsatzsteuerbefreiung: § 4 Nr. 21 UStG',
			'Umsatzsteuerbefreiung: § 4 Nr. 22a UStG'
		]);
		expect(model.lines.map((line) => line.exemptionReason)).toEqual([
			null,
			'§ 4 Nr. 21 UStG',
			'§ 4 Nr. 22a UStG',
			'§ 4 Nr. 21 UStG'
		]);
	});

	it('prints no exemption note on an invoice that is fully taxed', () => {
		const model = toInvoiceModel({
			invoice: draft,
			lines: [consulting],
			client,
			profile,
			refersTo: null,
			cancellation: null
		});
		expect(model.legalNotes).toEqual([]);
	});
});

describe('tax check of a draft (§ 14c UStG)', () => {
	const seller = { ...profile, street: 'Musterweg 1', postalCode: '40210', city: 'Düsseldorf' };
	const blockersOf = (
		lines: InvoiceLineRowDb[],
		over: { invoice?: Partial<InvoiceRowDb>; client?: Partial<ClientRowForInvoice> } = {}
	) =>
		toInvoiceModel({
			invoice: { ...draft, ...over.invoice },
			lines,
			client: { ...client, ...over.client },
			profile: seller,
			refersTo: null,
			cancellation: null
		}).blockers;

	const travel: InvoiceLineRowDb = {
		...consulting,
		id: '55555555-5555-5555-5555-555555555555',
		position: 2,
		description: 'Anfahrt'
	};

	it('finds nothing on a correctly taxed draft', () => {
		expect(
			blockersOf([consulting, { ...travel, tax_category: 'reduced', tax_rate_bp: 700 }])
		).toEqual([]);
	});

	it('names a wrong rate once, however many positions carry it', () => {
		const stale = { tax_rate_bp: 1600 };
		expect(
			blockersOf([
				{ ...consulting, ...stale },
				{ ...travel, ...stale }
			])
		).toEqual(['tax_rate_mismatch']);
	});

	it('measures a time position by its own last day and a free one by the period', () => {
		const time: InvoiceLineRowDb = {
			...consulting,
			kind: 'time',
			project_id: '66666666-6666-6666-6666-666666666666',
			quantity_milli: null,
			unit: null,
			minutes: 60,
			service_from: '2020-12-01',
			service_to: '2020-12-31',
			tax_rate_bp: 1600
		};
		expect(blockersOf([time, consulting])).toEqual([]);
		expect(blockersOf([{ ...time, service_to: '2021-01-04' }, consulting])).toEqual([
			'tax_rate_mismatch'
		]);
	});

	it('refuses a standard position once the client makes the invoice reverse charge', () => {
		expect(
			blockersOf([consulting], { client: { country_code: 'NL', vat_id: 'NL123456789B01' } })
		).toContain('tax_category_mismatch');
	});

	it('refuses a small business position on a regular invoice', () => {
		expect(
			blockersOf([{ ...consulting, tax_category: 'small_business', tax_rate_bp: 0 }])
		).toContain('tax_profile_mismatch');
	});

	it('refuses an invoice that comes out negative', () => {
		expect(
			blockersOf([{ ...consulting, unit_price_cents: '-10000', net_cents: '-10000' }])
		).toEqual(['total_negative']);
	});

	it('leaves an issued invoice alone', () => {
		expect(
			blockersOf([{ ...consulting, tax_rate_bp: 1600 }], { invoice: { status: 'issued' } })
		).toEqual([]);
	});
});
