import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import {
	add,
	compare,
	floor,
	fraction,
	fractionalPart,
	isNegative,
	isZero,
	max,
	min,
	multiply,
	negate,
	parseDecimal,
	subtract,
	toDecimal
} from './fraction';

describe('fraction', () => {
	it('reduces to lowest terms', () => {
		expect(fraction(4, 8)).toEqual({ num: 1, den: 2 });
	});

	it('moves a negative denominator to the numerator', () => {
		expect(fraction(3, -4)).toEqual({ num: -3, den: 4 });
	});

	it('rejects a zero denominator', () => {
		expect(() => fraction(1, 0)).toThrow();
	});

	it('rejects non-integer inputs', () => {
		expect(() => fraction(1.5, 1)).toThrow();
	});
});

describe('parseDecimal', () => {
	it('parses a plain integer', () => {
		expect(parseDecimal('20')).toEqual(fraction(20));
	});

	it('parses a decimal with a fraction of a day', () => {
		expect(parseDecimal('20.5')).toEqual(fraction(41, 2));
	});

	it('parses a negative amount', () => {
		expect(parseDecimal('-2.25')).toEqual(fraction(-9, 4));
	});

	it('rejects garbage input', () => {
		expect(() => parseDecimal('abc')).toThrow();
	});
});

describe('toDecimal', () => {
	it('formats with the requested number of places', () => {
		expect(toDecimal(fraction(41, 2), 2)).toBe('20.50');
	});

	it('formats a whole number without decimals', () => {
		expect(toDecimal(fraction(3, 1), 0)).toBe('3');
	});

	it('rounds half up', () => {
		expect(toDecimal(fraction(1, 3), 2)).toBe('0.33');
		expect(toDecimal(fraction(2, 3), 2)).toBe('0.67');
	});

	it('keeps the sign on negative amounts', () => {
		expect(toDecimal(fraction(-1, 4), 2)).toBe('-0.25');
	});
});

describe('arithmetic', () => {
	it('adds across different denominators', () => {
		expect(add(fraction(1, 2), fraction(1, 3))).toEqual(fraction(5, 6));
	});

	it('subtracts', () => {
		expect(subtract(fraction(1, 2), fraction(1, 3))).toEqual(fraction(1, 6));
	});

	it('multiplies', () => {
		expect(multiply(fraction(2, 3), fraction(3, 4))).toEqual(fraction(1, 2));
	});

	it('compares', () => {
		expect(compare(fraction(1, 2), fraction(2, 3))).toBeLessThan(0);
		expect(compare(fraction(2, 3), fraction(1, 2))).toBeGreaterThan(0);
		expect(compare(fraction(1, 2), fraction(2, 4))).toBe(0);
	});

	it('picks the smaller and larger of two fractions', () => {
		expect(min(fraction(1, 2), fraction(1, 3))).toEqual(fraction(1, 3));
		expect(max(fraction(1, 2), fraction(1, 3))).toEqual(fraction(1, 2));
	});

	it('flags zero and negative fractions', () => {
		expect(isZero(fraction(0, 5))).toBe(true);
		expect(isZero(fraction(1, 5))).toBe(false);
		expect(isNegative(fraction(-1, 5))).toBe(true);
		expect(isNegative(fraction(1, 5))).toBe(false);
	});

	it('negates', () => {
		expect(negate(fraction(3, 4))).toEqual(fraction(-3, 4));
	});

	it('splits off the whole part, keeping the sign towards zero', () => {
		expect(floor(fraction(7, 2))).toBe(3);
		expect(floor(fraction(-7, 2))).toBe(-4);
	});

	it('leaves the remainder after the whole part', () => {
		expect(fractionalPart(fraction(7, 2))).toEqual(fraction(1, 2));
	});
});

describe('fraction properties', () => {
	test.prop([fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 1, max: 1000 })], {
		numRuns: 1000
	})('toDecimal never drifts by more than half a unit at the requested precision', (num, den) => {
		const value = fraction(num, den);
		const places = 4;
		const rendered = Number(toDecimal(value, places));
		const exact = num / den;
		// exactly half a unit rounds up, so the bound has to be inclusive (with float slack)
		expect(Math.abs(rendered - exact)).toBeLessThanOrEqual(0.5 * 10 ** -places + 1e-9);
	});

	test.prop([fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 1, max: 1000 })], {
		numRuns: 1000
	})('floor plus fractional part reconstructs the original value', (num, den) => {
		const value = fraction(num, den);
		expect(add(fraction(floor(value)), fractionalPart(value))).toEqual(value);
	});

	test.prop(
		[
			fc.integer({ min: -1000, max: 1000 }),
			fc.integer({ min: 1, max: 1000 }),
			fc.integer({ min: -1000, max: 1000 }),
			fc.integer({ min: 1, max: 1000 })
		],
		{ numRuns: 1000 }
	)('addition is commutative', (an, ad, bn, bd) => {
		const a = fraction(an, ad);
		const b = fraction(bn, bd);
		expect(add(a, b)).toEqual(add(b, a));
	});
});
