import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { invoiceTotals, type TaxCategory, type TaxedAmount } from './index';

const RATES = [
	{ taxCategory: 'standard', taxRateBp: 1900 },
	{ taxCategory: 'reduced', taxRateBp: 700 },
	{ taxCategory: 'exempt', taxRateBp: 0 }
] as const;

const amount = (netCents: bigint, taxRateBp: number, taxCategory: TaxCategory): TaxedAmount => ({
	netCents,
	taxCategory,
	taxRateBp
});
const standard = (netCents: bigint) => amount(netCents, 1900, 'standard');
const reduced = (netCents: bigint) => amount(netCents, 700, 'reduced');
const exempt = (netCents: bigint) => amount(netCents, 0, 'exempt');

const groupsOf = (lines: readonly TaxedAmount[]) =>
	invoiceTotals(lines).groups.map((group) => [
		group.taxCategory,
		group.taxRateBp,
		group.netCents,
		group.taxCents
	]);

const awayFromZero = (net: bigint, taxRateBp: number) => {
	const exact = net * BigInt(taxRateBp);
	const size = ((exact < 0n ? -exact : exact) + 5000n) / 10000n;
	return exact < 0n ? -size : size;
};

const anyMixedLine = fc
	.record({
		netCents: fc.oneof(
			fc.bigInt({ min: -5_000_000n, max: 5_000_000n }),
			fc.bigInt({ min: -200n, max: 200n })
		),
		rate: fc.constantFrom(...RATES)
	})
	.map(({ netCents, rate }) => amount(netCents, rate.taxRateBp, rate.taxCategory));
const anyMixedInvoice = fc.array(anyMixedLine, { minLength: 1, maxLength: 25 });

describe('invoiceTotals with 19, 7 and 0 percent and discounts', () => {
	it('takes the tax of each rate from its summed net amount', () => {
		const lines = [
			standard(5000n),
			...Array.from({ length: 10 }, () => standard(2n)),
			...Array.from({ length: 3 }, () => reduced(50n)),
			exempt(1000n),
			standard(-1000n)
		];
		expect(groupsOf(lines)).toEqual([
			['standard', 1900, 4020n, 764n],
			['reduced', 700, 150n, 11n],
			['exempt', 0, 1000n, 0n]
		]);
		expect(invoiceTotals(lines)).toMatchObject({
			netCents: 5170n,
			taxCents: 775n,
			grossCents: 5945n
		});
	});

	it('rounds a group that a discount pushed below zero away from zero as well', () => {
		const lines = [standard(10000n), reduced(100n), reduced(-250n), exempt(0n)];
		expect(groupsOf(lines)).toEqual([
			['standard', 1900, 10000n, 1900n],
			['reduced', 700, -150n, -11n],
			['exempt', 0, 0n, 0n]
		]);
		expect(invoiceTotals(lines)).toMatchObject({
			netCents: 9850n,
			taxCents: 1889n,
			grossCents: 11739n
		});
	});

	test.prop([anyMixedInvoice], { numRuns: 1000 })(
		'every group carries its net sum times its rate, half a cent away from zero',
		(lines) => {
			for (const group of invoiceTotals(lines).groups) {
				const net = lines
					.filter((line) => line.taxRateBp === group.taxRateBp)
					.reduce((sum, line) => sum + line.netCents, 0n);
				expect(group.netCents).toBe(net);
				expect(group.taxCents).toBe(awayFromZero(net, group.taxRateBp));
			}
		}
	);

	test.prop([anyMixedInvoice], { numRuns: 1000 })(
		'never has more groups than rates, and none for a rate without lines',
		(lines) => {
			const byRate = (a: number, b: number) => a - b;
			const used = new Set(lines.map((line) => line.taxRateBp));
			expect(
				invoiceTotals(lines)
					.groups.map((group) => group.taxRateBp)
					.toSorted(byRate)
			).toEqual([...used].toSorted(byRate));
		}
	);

	test.prop([anyMixedInvoice, fc.nat(), fc.bigInt({ min: -1_000_000n, max: 1_000_000n })], {
		numRuns: 1000
	})('splitting a line into two of the same rate changes no sum', (lines, pick, part) => {
		const at = pick % lines.length;
		const line = lines[at]!;
		const split = [
			...lines.slice(0, at),
			{ ...line, netCents: part },
			{ ...line, netCents: line.netCents - part },
			...lines.slice(at + 1)
		];
		const { netCents, taxCents, grossCents } = invoiceTotals(lines);
		expect(invoiceTotals(split)).toMatchObject({ netCents, taxCents, grossCents });
	});

	test.prop([anyMixedInvoice], { numRuns: 1000 })(
		'a cancellation of the mixed invoice mirrors it to the cent',
		(lines) => {
			const invoice = invoiceTotals(lines);
			const cancellation = invoiceTotals(
				lines.map((line) => ({ ...line, netCents: 0n - line.netCents }))
			);
			expect(cancellation.groups.map((group) => group.taxCents)).toEqual(
				invoice.groups.map((group) => 0n - group.taxCents)
			);
			expect(cancellation.grossCents).toBe(0n - invoice.grossCents);
		}
	);
});
