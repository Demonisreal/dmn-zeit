import { describe, expect, it } from 'vitest';
import { defaultClosingText, defaultIntroText, legalNoteTexts } from './texts';

describe('invoice texts', () => {
	it('has a german and an english default text', () => {
		expect(defaultIntroText.de).toBeTruthy();
		expect(defaultIntroText.en).toBeTruthy();
		expect(defaultClosingText.de).toBeTruthy();
		expect(defaultClosingText.en).toBeTruthy();
	});

	it('keeps de and en on the same legal note keys', () => {
		expect(Object.keys(legalNoteTexts.en).sort()).toEqual(Object.keys(legalNoteTexts.de).sort());
	});

	it('carries a text for every legal note key rules.invoiceForm can produce', () => {
		const keys = ['small_business_19', 'reverse_charge_13b', 'late_payment_286_consumer', 'exempt_reason'];
		for (const locale of ['de', 'en'] as const) {
			for (const key of keys) {
				expect(legalNoteTexts[locale][key], `${locale}.${key}`).toBeTruthy();
			}
		}
	});
});
