import { describe, expect, it } from 'vitest';
import { invoiceLineInputSchema, invoicePeriodIssue, updateDraftSchema } from './billing';
import { centsSchema } from './common';

const line = {
	description: 'Hosting-Pauschale September',
	quantityMilli: '1000',
	unit: 'LS',
	unitPriceCents: '4900',
	taxCategory: 'standard'
};

describe('invoiceLineInputSchema', () => {
	it.each(['1', '999999999'])('takes a quantity of %s thousandths', (quantityMilli) => {
		expect(invoiceLineInputSchema.safeParse({ ...line, quantityMilli }).success).toBe(true);
	});

	it.each(['0', '-1000', '1000000000', '1.5', '0100'])(
		'refuses a quantity of %o',
		(quantityMilli) => {
			expect(invoiceLineInputSchema.safeParse({ ...line, quantityMilli }).success).toBe(false);
		}
	);

	it.each(['0', '999999999', '-15000', '-999999999'])(
		'takes a unit price of %s cents, a discount too',
		(unitPriceCents) => {
			expect(invoiceLineInputSchema.safeParse({ ...line, unitPriceCents }).success).toBe(true);
		}
	);

	it.each(['1000000000', '-1000000000', '49.00', ''])(
		'refuses a unit price of %o',
		(unitPriceCents) => {
			expect(
				invoiceLineInputSchema.safeParse({ ...line, unitPriceCents }).error?.issues[0]?.message
			).toBe('format.cents');
		}
	);

	it('keeps the largest line within the fifteen digits of a cents amount', () => {
		const largest = (999_999_999n * 999_999_999n + 500n) / 1000n;
		expect(largest).toBe(999_999_998_000_000n);
		expect(centsSchema.safeParse(String(largest)).success).toBe(true);
		expect(centsSchema.safeParse(String(-largest)).success).toBe(true);
	});

	it('stays partial for the patch of a line', () => {
		expect(invoiceLineInputSchema.partial().parse({ unitPriceCents: '-500' })).toEqual({
			unitPriceCents: '-500'
		});
	});

	it('keeps the description within 1000 characters', () => {
		expect(
			invoiceLineInputSchema.safeParse({ ...line, description: 'x'.repeat(1001) }).success
		).toBe(false);
	});
});

describe('invoicePeriodIssue', () => {
	it.each([
		['2026-09-01', '2026-09-01'],
		['2028-01-01', '2028-12-31'],
		['2026-03-15', '2027-03-15']
	])('lets %s to %s through', (from, to) => {
		expect(invoicePeriodIssue({ from, to })).toBeNull();
	});

	it('stops a period past 366 days', () => {
		expect(invoicePeriodIssue({ from: '2026-03-15', to: '2027-03-16' })).toBe(
			'invoice.rangeTooLong'
		);
	});

	it('stops an end before the start', () => {
		expect(invoicePeriodIssue({ from: '2026-09-02', to: '2026-09-01' })).toBe('range.unordered');
	});
});

describe('updateDraftSchema', () => {
	it('checks the period when both ends come along', () => {
		expect(
			updateDraftSchema.safeParse({ from: '2025-01-01', to: '2026-06-01' }).error?.issues
		).toMatchObject([{ message: 'invoice.rangeTooLong', path: ['to'] }]);
	});

	it('leaves a single end to the service, which knows the other one', () => {
		expect(updateDraftSchema.safeParse({ to: '2030-12-31' }).success).toBe(true);
		expect(invoicePeriodIssue({ from: '2026-09-01', to: '2030-12-31' })).toBe(
			'invoice.rangeTooLong'
		);
	});
});
