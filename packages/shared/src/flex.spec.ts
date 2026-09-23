import { describe, expect, it } from 'vitest';
import { createFlexBookingSchema } from './flex';

describe('createFlexBookingSchema', () => {
	const booking = { effectiveDate: '2026-09-30', reason: 'Auszahlung laut Vereinbarung' };

	it('only takes payouts that lower the balance', () => {
		expect(
			createFlexBookingSchema.safeParse({ ...booking, type: 'payout', minutes: -600 }).success
		).toBe(true);
		expect(
			createFlexBookingSchema.safeParse({ ...booking, type: 'payout', minutes: 600 }).success
		).toBe(false);
	});

	it('leaves the cap to the month closing', () => {
		expect(
			createFlexBookingSchema.safeParse({ ...booking, type: 'cap_forfeit', minutes: -60 }).success
		).toBe(false);
	});
});
