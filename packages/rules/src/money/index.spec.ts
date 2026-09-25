import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { parseCents, percentOf, roundDiv } from './index';

describe('roundDiv', () => {
	it('divides exactly when nothing is left over', () => {
		expect(roundDiv(9000n, 60n)).toBe(150n);
	});

	it('rounds below half down and from half up', () => {
		expect(roundDiv(14n, 10n)).toBe(1n);
		expect(roundDiv(15n, 10n)).toBe(2n);
		expect(roundDiv(16n, 10n)).toBe(2n);
	});

	it('rounds a negative half away from zero, the mirror image of the positive one', () => {
		expect(roundDiv(-15n, 10n)).toBe(-2n);
		expect(roundDiv(-14n, 10n)).toBe(-1n);
	});

	it('handles a negative divisor the same way', () => {
		expect(roundDiv(15n, -10n)).toBe(-2n);
		expect(roundDiv(-15n, -10n)).toBe(2n);
		expect(roundDiv(-14n, -10n)).toBe(1n);
	});

	it('keeps zero at zero', () => {
		expect(roundDiv(0n, 7n)).toBe(0n);
	});

	it('throws on a zero divisor', () => {
		expect(() => roundDiv(1n, 0n)).toThrow();
	});
});

describe('percentOf', () => {
	it('takes 19 % of a net amount', () => {
		expect(percentOf(10000n, 1900)).toBe(1900n);
	});

	it('rounds half a cent away from zero', () => {
		// 7 % of 50 cents is 3.5 cents
		expect(percentOf(50n, 700)).toBe(4n);
		expect(percentOf(-50n, 700)).toBe(-4n);
	});

	it('is zero for a rate of zero', () => {
		expect(percentOf(123456n, 0)).toBe(0n);
	});
});

describe('parseCents', () => {
	it('parses whole euros', () => {
		expect(parseCents('95')).toBe(9500n);
	});

	it('parses two decimals', () => {
		expect(parseCents('95.00')).toBe(9500n);
		expect(parseCents('0.07')).toBe(7n);
	});

	it('reads a single decimal as tenths', () => {
		expect(parseCents('-12.5')).toBe(-1250n);
	});

	it('ignores surrounding whitespace', () => {
		expect(parseCents(' 1.99 ')).toBe(199n);
	});

	it('parses amounts beyond the safe integer range', () => {
		expect(parseCents('123456789012345.67')).toBe(12345678901234567n);
	});

	it('rejects a third decimal', () => {
		expect(() => parseCents('1.005')).toThrow('parseCents');
	});

	it('rejects garbage, a comma and an empty string', () => {
		expect(() => parseCents('abc')).toThrow();
		expect(() => parseCents('1,50')).toThrow();
		expect(() => parseCents('')).toThrow();
		expect(() => parseCents('1.')).toThrow();
	});
});

const abs = (n: bigint) => (n < 0n ? -n : n);
const euros = (cents: bigint) =>
	`${cents < 0n ? '-' : ''}${abs(cents) / 100n}.${String(abs(cents) % 100n).padStart(2, '0')}`;

// well beyond Number.MAX_SAFE_INTEGER, so a hidden detour through number would show up
const anyCents = fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n });
const anyDivisor = fc.bigInt({ min: 1n, max: 10n ** 6n });
const anyBasisPoints = fc.integer({ min: 0, max: 10000 });

describe('money properties', () => {
	test.prop([anyCents, anyDivisor], { numRuns: 1000 })(
		'roundDiv never drifts by more than half from the exact quotient',
		(num, den) => {
			const rest = num - roundDiv(num, den) * den;
			expect(2n * abs(rest)).toBeLessThanOrEqual(den);
		}
	);

	test.prop([anyCents, anyDivisor], { numRuns: 1000 })(
		'roundDiv takes an exact half away from zero',
		(whole, half) => {
			const num = whole * 2n * half + (whole < 0n ? -half : half);
			expect(roundDiv(num, 2n * half)).toBe(whole < 0n ? whole - 1n : whole + 1n);
		}
	);

	test.prop([anyCents, anyCents, anyDivisor], { numRuns: 1000 })(
		'roundDiv never gets smaller when the numerator grows',
		(a, b, den) => {
			const [low, high] = a <= b ? [a, b] : [b, a];
			expect(roundDiv(low, den)).toBeLessThanOrEqual(roundDiv(high, den));
		}
	);

	test.prop([anyCents, anyDivisor], { numRuns: 1000 })(
		'roundDiv rounds a negated amount to the exact mirror image',
		(num, den) => {
			expect(roundDiv(-num, den)).toBe(-roundDiv(num, den));
			expect(roundDiv(num, -den)).toBe(-roundDiv(num, den));
		}
	);

	test.prop([anyCents, anyBasisPoints], { numRuns: 1000 })(
		'percentOf stays within half a cent and mirrors a cancellation',
		(cents, basisPoints) => {
			const tax = percentOf(cents, basisPoints);
			expect(2n * abs(cents * BigInt(basisPoints) - tax * 10000n)).toBeLessThanOrEqual(10000n);
			expect(percentOf(-cents, basisPoints)).toBe(-tax);
		}
	);

	test.prop([anyCents, anyCents, anyBasisPoints], { numRuns: 1000 })(
		'percentOf never gets smaller when the amount grows',
		(a, b, basisPoints) => {
			const [low, high] = a <= b ? [a, b] : [b, a];
			expect(percentOf(low, basisPoints)).toBeLessThanOrEqual(percentOf(high, basisPoints));
		}
	);

	test.prop([anyCents], { numRuns: 1000 })(
		'parseCents reads back every amount written with two decimals',
		(cents) => {
			expect(parseCents(euros(cents))).toBe(cents);
		}
	);

	test.prop([anyCents], { numRuns: 1000 })(
		'parseCents reads one decimal as tenths and none as whole euros',
		(cents) => {
			expect(parseCents(euros(cents * 10n).slice(0, -1))).toBe(cents * 10n);
			expect(parseCents(euros(cents * 100n).slice(0, -3))).toBe(cents * 100n);
		}
	);
});
