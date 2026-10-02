import { describe, expect, it } from 'vitest';
import { rateText, roundingText } from './explain';

describe('roundingText', () => {
	it('describes an upward rounding in german', () => {
		const text = roundingText(
			{ key: 'billing.rounding.up', params: { raw: 2247, increment: 15, rounded: 2310 } },
			'de'
		);
		expect(text).toBe('37:27 Std. erfasst, je Tag auf 15 Min. aufgerundet');
	});

	it('describes the same rounding in english', () => {
		const text = roundingText(
			{ key: 'billing.rounding.down', params: { raw: 47, increment: 15, rounded: 45 } },
			'en'
		);
		expect(text).toBe('0:47 h recorded, rounded down to 15 min per day');
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
