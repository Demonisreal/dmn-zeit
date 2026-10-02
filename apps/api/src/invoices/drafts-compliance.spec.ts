import type { BillingProfile } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
	buildTimeLines,
	liveBuyer,
	liveSeller,
	toInvoiceModel,
	type ClientRowForInvoice,
	type InvoiceLineRowDb,
	type InvoiceRowDb,
	type UnbilledEntryRow
} from './drafts';
import { legalNoteTexts } from './texts';

const booking = (id: string, startedAt: string, endedAt: string): UnbilledEntryRow => ({
	id,
	employeeId: 'e1',
	projectId: 'p1',
	taskId: null,
	workday: startedAt.slice(0, 10),
	startedAt,
	endedAt,
	entryBillable: null,
	taskBillable: null,
	projectBillable: true,
	projectName: 'Relaunch',
	taskName: null,
	projectIncrement: 15,
	projectMode: 'up',
	clientIncrement: null,
	clientMode: null,
	source: 'manual'
});

describe('buildTimeLines rounding', () => {
	it('explains the rounding of the whole line, not of its first day', () => {
		const [line] = buildTimeLines({
			entries: [
				booking('mon', '2026-08-03T08:00:00Z', '2026-08-03T08:47:00Z'),
				booking('tue', '2026-08-04T09:00:00Z', '2026-08-04T09:23:00Z'),
				booking('wed', '2026-08-05T10:00:00Z', '2026-08-05T12:00:00Z')
			],
			clientId: 'c1',
			rates: [
				{
					id: 'r1',
					clientId: null,
					projectId: null,
					taskId: null,
					employeeId: null,
					validFrom: Temporal.PlainDate.from('2026-01-01'),
					cents: 9500n
				}
			],
			taxCategory: 'standard'
		});
		expect(line!.minutes).toBe(60 + 30 + 120);
		expect(line!.derivation.rounding).toEqual({
			key: 'billing.rounding.up',
			params: { raw: 47 + 23 + 120, increment: 15, rounded: 210 }
		});
	});
});

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
	iban: 'DE75512108001245126199',
	bic: null,
	bankName: null,
	contactName: null,
	contactEmail: null,
	contactPhone: null,
	registerCourt: null,
	registerNumber: null,
	invoicePrefix: '',
	paymentTermsDays: 14,
	roundingIncrementMin: 15,
	roundingMode: 'up',
	defaultFormat: 'pdf'
};

const kranich: ClientRowForInvoice = {
	name: 'Kranich Logistik GmbH',
	street: 'Hafenstraße 12',
	postal_code: '20457',
	city: 'Hamburg',
	country_code: 'DE',
	is_business: true,
	vat_id: null,
	email: null,
	buyer_reference: null,
	number: null
};

const consulting = (
	netCents: number,
	tax_category: InvoiceLineRowDb['tax_category'] = 'standard'
): InvoiceLineRowDb => ({
	id: '11111111-1111-4111-8111-111111111111',
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
	unit_price_cents: String(netCents),
	net_cents: String(netCents),
	tax_category,
	tax_rate_bp: tax_category === 'standard' ? 1900 : 0,
	exemption_reason: null,
	derivation: null
});

const issued = (over: Partial<InvoiceRowDb> = {}): InvoiceRowDb => ({
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
	issued_at: '2026-09-04T09:00:00+02:00',
	issued_by: null,
	created_by: null,
	created_at: '2026-09-03T09:00:00+02:00',
	updated_at: '2026-09-04T09:00:00+02:00',
	retain_until: '2034-12-31',
	...over
});

const model = (
	client: ClientRowForInvoice,
	line: InvoiceLineRowDb,
	over: Partial<InvoiceRowDb> = {},
	seller: BillingProfile = profile
) =>
	toInvoiceModel({
		invoice: issued({ seller: liveSeller(seller), buyer: liveBuyer(client), ...over }),
		lines: [line],
		client,
		profile: seller,
		refersTo: null,
		cancellation: null
	});

describe('toInvoiceModel form inputs', () => {
	it('blocks on the addresses of the snapshots', () => {
		expect(model({ ...kranich, street: null }, consulting(100_000)).blockers).toEqual([
			'buyer_address_incomplete'
		]);
		expect(model(kranich, consulting(100_000), {}, { ...profile, city: null }).blockers).toEqual([
			'seller_address_incomplete'
		]);
		expect(
			model({ ...kranich, street: null, postal_code: null, city: null }, consulting(10_000))
				.blockers
		).toEqual([]);
	});

	it('hints at XRechnung for a public buyer only while the format is pdf', () => {
		const city = { ...kranich, buyer_reference: '14713000-DIGI01-62' };
		expect(model(city, consulting(100_000)).hints).toEqual(['public_buyer_wants_xrechnung']);
		expect(model(city, consulting(100_000), { format: 'xrechnung' }).hints).toEqual([]);
		expect(
			model({ ...kranich, buyer_reference: 'PO-2026-118' }, consulting(100_000)).hints
		).toEqual([]);
	});

	it('drops the § 286 note on a cancellation for a consumer', () => {
		const consumer = { ...kranich, is_business: false };
		expect(model(consumer, consulting(100_000)).legalNotes).toEqual([
			legalNoteTexts.de.late_payment_286_consumer
		]);
		expect(
			model(consumer, consulting(-100_000), { kind: 'cancellation', number: '2026-0019' })
				.legalNotes
		).toEqual([]);
	});

	it('resolves the third country note to the text the XML uses', () => {
		const zurich = { ...kranich, country_code: 'CH', city: 'Zürich', postal_code: '8001' };
		expect(model(zurich, consulting(100_000, 'outside_scope')).legalNotes).toEqual([
			'Nicht im Inland steuerbare Leistung, Leistungsort nach § 3a Abs. 2 UStG im Ausland.'
		]);
	});
});
