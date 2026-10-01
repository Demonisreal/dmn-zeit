import type { InvoiceFormat } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { defaultInvoiceFormat } from '../../src/einvoice/default-format';

const LEITWEG_ID = '14713000-DIGI01-62';

const business = {
	clientFormat: null,
	isBusiness: true,
	buyerReference: null,
	profileFormat: 'pdf'
} satisfies Parameters<typeof defaultInvoiceFormat>[0];

describe('defaultInvoiceFormat', () => {
	it('takes the format set on the client, whatever else is known', () => {
		expect(
			defaultInvoiceFormat({ ...business, clientFormat: 'pdf', buyerReference: LEITWEG_ID })
		).toBe('pdf');
		expect(
			defaultInvoiceFormat({ ...business, clientFormat: 'xrechnung', isBusiness: false })
		).toBe('xrechnung');
	});

	it('sends a private client a pdf, a profile default does not change that', () => {
		expect(defaultInvoiceFormat({ ...business, isBusiness: false })).toBe('pdf');
		expect(defaultInvoiceFormat({ ...business, isBusiness: false, profileFormat: 'zugferd' })).toBe(
			'pdf'
		);
	});

	it('sends a public client with a Leitweg-ID an XRechnung', () => {
		expect(defaultInvoiceFormat({ ...business, buyerReference: LEITWEG_ID })).toBe('xrechnung');
		expect(
			defaultInvoiceFormat({ ...business, buyerReference: LEITWEG_ID, profileFormat: 'zugferd' })
		).toBe('xrechnung');
	});

	it('takes a reference with a wrong check digit for no Leitweg-ID', () => {
		expect(defaultInvoiceFormat({ ...business, buyerReference: '14713000-DIGI01-45' })).toBe(
			'zugferd'
		);
	});

	it.each<[string, InvoiceFormat, InvoiceFormat]>([
		['nothing chosen in the profile', 'pdf', 'zugferd'],
		['ZUGFeRD in the profile', 'zugferd', 'zugferd'],
		['XRechnung in the profile', 'xrechnung', 'xrechnung']
	])(
		'gives any other business client ZUGFeRD or the profile default, %s',
		(_name, profileFormat, format) => {
			expect(defaultInvoiceFormat({ ...business, profileFormat })).toBe(format);
			expect(
				defaultInvoiceFormat({ ...business, buyerReference: 'PO-2026-118', profileFormat })
			).toBe(format);
		}
	);
});
