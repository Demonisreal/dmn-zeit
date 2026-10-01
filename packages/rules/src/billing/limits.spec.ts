import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { invoiceTotals, type TaxCategory, type TaxedAmount } from './index';
import { MAX_INVOICE_CENTS, totalBlockers } from './limits';

const amount = (netCents: bigint, taxCategory: TaxCategory = 'standard'): TaxedAmount => ({
	netCents,
	taxCategory,
	taxRateBp: taxCategory === 'standard' ? 1900 : 0
});

const LARGEST_LINE = 999_999_998_000_000n;

describe('totalBlockers', () => {
	it('lets an empty or a zero invoice through', () => {
		expect(totalBlockers(invoiceTotals([]))).toEqual([]);
		expect(totalBlockers(invoiceTotals([amount(0n)]))).toEqual([]);
	});

	it('lets a discount through as long as the invoice stays positive', () => {
		expect(totalBlockers(invoiceTotals([amount(100_000n), amount(-15_000n)]))).toEqual([]);
	});

	it('stops a discount larger than the work', () => {
		expect(totalBlockers(invoiceTotals([amount(10_000n), amount(-15_000n)]))).toEqual([
			'total_negative'
		]);
	});

	it('stops a negative net amount even when the tax of another group pulls the gross up', () => {
		const totals = invoiceTotals([amount(10_000n), amount(-10_500n, 'exempt')]);
		expect(totals.grossCents).toBe(1_400n);
		expect(totalBlockers(totals)).toEqual(['total_negative']);
	});

	it('stops a negative gross amount on a net of zero', () => {
		const totals = invoiceTotals([amount(1_000n, 'exempt'), amount(-1_000n)]);
		expect(totals.netCents).toBe(0n);
		expect(totalBlockers(totals)).toEqual(['total_negative']);
	});

	it('takes the largest amount fifteen digits can hold', () => {
		expect(totalBlockers(invoiceTotals([amount(MAX_INVOICE_CENTS, 'exempt')]))).toEqual([]);
		expect(totalBlockers(invoiceTotals([amount(MAX_INVOICE_CENTS + 1n, 'exempt')]))).toEqual([
			'total_too_large'
		]);
	});

	it('stops a sum of large lines past fifteen digits, the tax included', () => {
		expect(totalBlockers(invoiceTotals([amount(LARGEST_LINE, 'exempt')]))).toEqual([]);
		expect(totalBlockers(invoiceTotals([amount(LARGEST_LINE)]))).toEqual(['total_too_large']);
		expect(
			totalBlockers(invoiceTotals([amount(LARGEST_LINE, 'exempt'), amount(LARGEST_LINE, 'exempt')]))
		).toEqual(['total_too_large']);
	});

	it('stops a group past fifteen digits even when the groups cancel out', () => {
		const totals = invoiceTotals([
			amount(LARGEST_LINE, 'exempt'),
			amount(LARGEST_LINE, 'exempt'),
			amount(-LARGEST_LINE, 'outside_scope'),
			amount(-LARGEST_LINE, 'outside_scope')
		]);
		expect(totals.grossCents).toBe(0n);
		expect(totalBlockers(totals)).toEqual(['total_too_large']);
	});

	it('names both when a huge invoice is negative', () => {
		expect(totalBlockers(invoiceTotals([amount(-2n * LARGEST_LINE, 'exempt')]))).toEqual([
			'total_negative',
			'total_too_large'
		]);
	});
});

const anyLine = fc
	.record({
		netCents: fc.bigInt({ min: 0n, max: 10_000_000_000n }),
		taxCategory: fc.constantFrom<TaxCategory>('standard', 'exempt', 'reverse_charge')
	})
	.map(({ netCents, taxCategory }) => amount(netCents, taxCategory));

describe('totalBlockers properties', () => {
	test.prop([fc.array(anyLine, { maxLength: 30 })], { numRuns: 1000 })(
		'an invoice of ordinary positive lines passes, its mirror image only fails on the sign',
		(lines) => {
			const totals = invoiceTotals(lines);
			expect(totalBlockers(totals)).toEqual([]);
			const mirrored = invoiceTotals(lines.map((line) => ({ ...line, netCents: -line.netCents })));
			expect(totalBlockers(mirrored)).toEqual(totals.netCents > 0n ? ['total_negative'] : []);
		}
	);
});
