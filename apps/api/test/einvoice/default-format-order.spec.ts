import { describe, expect, it } from 'vitest';
import { defaultInvoiceFormat } from '../../src/einvoice/default-format';

describe('defaultInvoiceFormat, order of the rules', () => {
	it('keeps a private client on pdf even with a valid Leitweg-ID', () => {
		expect(
			defaultInvoiceFormat({
				clientFormat: null,
				isBusiness: false,
				buyerReference: '14713000-DIGI01-62',
				profileFormat: 'xrechnung'
			})
		).toBe('pdf');
	});

	it('lets the Leitweg-ID beat the profile for a business client', () => {
		expect(
			defaultInvoiceFormat({
				clientFormat: null,
				isBusiness: true,
				buyerReference: '14713000-DIGI01-62',
				profileFormat: 'pdf'
			})
		).toBe('xrechnung');
	});
});
