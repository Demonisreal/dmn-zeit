import { validationKeys } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { errorKey } from '../../app/error-key';
import billingDe from '../../i18n/locales/de/billing.json';
import commonDe from '../../i18n/locales/de/common.json';
import billingEn from '../../i18n/locales/en/billing.json';
import commonEn from '../../i18n/locales/en/common.json';
import { ApiRequestError } from '../../lib/api/errors';

const blockers = [
	'vat_id_missing',
	'tax_number_missing',
	'seller_address_incomplete',
	'buyer_address_incomplete',
	'tax_profile_mismatch',
	'tax_treatment_stale',
	'tax_category_mismatch',
	'tax_rate_mismatch',
	'total_negative',
	'total_too_large',
	'text_not_xml',
	'seller_tax_id_missing',
	'exemption_reason_missing',
	'seller_contact_missing',
	'iban_missing',
	'buyer_reference_missing',
	'buyer_endpoint_missing',
	'buyer_vat_id_missing',
	'long_timer_entry'
];

const hints = ['service_deadline_14a_1', 'public_buyer_wants_xrechnung', 'long_timer_entry'];

const at = (tree: unknown, path: string) =>
	path
		.split('.')
		.reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree);

describe.each([
	['de', billingDe, commonDe],
	['en', billingEn, commonEn]
])('texts in %s', (_, billing, common) => {
	it('name every blocker and hint a draft can carry', () => {
		for (const code of blockers) {
			expect(at(billing, `invoiceEditor.blockers.${code}`), code).toEqual(expect.any(String));
		}
		for (const code of hints) {
			expect(at(billing, `invoiceEditor.hints.${code}`), code).toEqual(expect.any(String));
		}
	});

	it('name every validation key the api can send', () => {
		for (const key of validationKeys) {
			expect(at(common, `validation.${key}`), key).toEqual(expect.any(String));
		}
	});

	it('name a busy renderer and a document past the page limit', () => {
		const busy = errorKey(
			new ApiRequestError(503, { code: 'RENDER_BUSY', message: '', details: null })
		);
		const long = errorKey(
			new ApiRequestError(422, { code: 'PAGE_LIMIT', message: '', details: { maxPages: 50 } })
		);
		expect([busy, long]).toEqual(['common:errors.renderBusy', 'common:errors.pageLimit']);
		expect(at(common, 'errors.renderBusy')).toEqual(expect.any(String));
		expect(at(common, 'errors.pageLimit')).toEqual(expect.any(String));
	});
});
