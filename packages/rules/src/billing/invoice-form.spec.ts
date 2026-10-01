import { describe, expect, it } from 'vitest';
import { invoiceForm, type PostalAddress } from './index';

const leipzig: PostalAddress = { street: 'Lindenweg 4', postalCode: '04109', city: 'Leipzig' };
const hamburg: PostalAddress = { street: 'Hafenstraße 12', postalCode: '20457', city: 'Hamburg' };

const form = (overrides: Partial<Parameters<typeof invoiceForm>[0]> = {}) =>
	invoiceForm({
		kind: 'invoice',
		format: 'pdf',
		grossCents: 433_359n,
		treatment: 'standard',
		isBusiness: true,
		profile: { hasVatId: true, hasTaxNumber: true },
		seller: leipzig,
		buyer: { ...hamburg, leitwegId: false },
		...overrides
	});

describe('invoiceForm addresses (§ 14 Abs. 4 Nr. 1 UStG)', () => {
	it.each(['street', 'postalCode', 'city'] as const)(
		'blocks an invoice whose seller has no %s',
		(field) => {
			expect(form({ seller: { ...leipzig, [field]: null } }).blockers).toEqual([
				'seller_address_incomplete'
			]);
		}
	);

	it('counts an empty street as missing', () => {
		expect(form({ seller: { ...leipzig, street: '' } }).blockers).toEqual([
			'seller_address_incomplete'
		]);
	});

	it.each(['street', 'postalCode', 'city'] as const)(
		'blocks an invoice whose buyer has no %s',
		(field) => {
			const buyer = { ...hamburg, [field]: null, leitwegId: false };
			expect(form({ buyer }).blockers).toEqual(['buyer_address_incomplete']);
		}
	);

	it('lets a small amount invoice go without the buyer address, never without the own one', () => {
		const nowhere = { street: null, postalCode: null, city: null };
		expect(form({ grossCents: 22_610n, buyer: { ...nowhere, leitwegId: false } }).blockers).toEqual(
			[]
		);
		expect(
			form({ grossCents: 22_610n, seller: nowhere, buyer: { ...nowhere, leitwegId: false } })
				.blockers
		).toEqual(['seller_address_incomplete']);
	});

	it('asks for the buyer address under reverse charge even below 250 euros', () => {
		const buyer = { ...hamburg, street: null, leitwegId: false };
		expect(form({ grossCents: 19_000n, treatment: 'reverse_charge', buyer }).blockers).toEqual([
			'buyer_address_incomplete'
		]);
	});
});

describe('invoiceForm third country', () => {
	it('prints the not taxable note', () => {
		expect(form({ treatment: 'outside_scope' }).legalNotes).toEqual(['outside_scope_3a']);
	});

	it('needs the tax number, the vat id is left off like in the XML', () => {
		expect(
			form({ treatment: 'outside_scope', profile: { hasVatId: true, hasTaxNumber: false } })
				.blockers
		).toEqual(['tax_number_missing']);
		expect(
			form({ treatment: 'outside_scope', profile: { hasVatId: false, hasTaxNumber: true } })
				.blockers
		).toEqual([]);
	});
});

describe('invoiceForm cancellation', () => {
	it('carries no § 286 note, a cancellation asks nobody to pay', () => {
		expect(
			form({ kind: 'cancellation', grossCents: -433_359n, isBusiness: false }).legalNotes
		).toEqual([]);
	});

	it('still names the treatment of the original', () => {
		expect(
			form({ kind: 'cancellation', grossCents: -336_000n, treatment: 'reverse_charge' }).legalNotes
		).toEqual(['reverse_charge_13b']);
	});
});

describe('invoiceForm public buyers', () => {
	it('hints at XRechnung when a buyer with Leitweg-ID gets a plain pdf', () => {
		const buyer = { ...hamburg, leitwegId: true };
		expect(form({ buyer }).hints).toEqual(['public_buyer_wants_xrechnung']);
		expect(form({ buyer, format: 'xrechnung' }).hints).toEqual([]);
		expect(form({ buyer, format: 'zugferd' }).hints).toEqual([]);
	});

	it('stays quiet for a buyer without Leitweg-ID', () => {
		expect(form().hints).toEqual([]);
	});
});
