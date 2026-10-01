import { describe, expect, it } from 'vitest';
import { rateText, roundingText } from './explain';

describe('roundingText', () => {
	it('describes an upward rounding in german', () => {
		const text = roundingText({ key: 'billing.rounding.up', params: { raw: 47, increment: 15, rounded: 60 } }, 'de');
		expect(text).toBe('47 Min. aufgerundet auf 60 Min. (15-Min.-Raster)');
	});

	it('describes the same rounding in english', () => {
		const text = roundingText(
			{ key: 'billing.rounding.down', params: { raw: 47, increment: 15, rounded: 45 } },
			'en'
		);
		expect(text).toBe('47 min rounded down to 45 min (15-min. steps)');
	});

	it('returns null for a key it does not know, instead of guessing a sentence', () => {
		expect(roundingText({ key: 'billing.rounding.rule', params: {} }, 'de')).toBeNull();
	});
});

describe('rateText', () => {
	it('names the winning rate level', () => {
		expect(rateText({ key: 'billing.rate.client_employee', params: {} }, 'de')).toBe(
			'Satz für Kunde und Person'
		);
		expect(rateText({ key: 'billing.rate.default', params: {} }, 'en')).toBe('default rate');
	});
});
