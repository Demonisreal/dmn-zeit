import { describe, expect, it } from 'vitest';
import { createAbsenceSchema } from './absences';
import { createFlexBookingSchema } from './flex';

const employeeId = '5c3e2d1a-0f9b-4a8c-b7d6-e5f4a3b2c1d0';

describe('createAbsenceSchema', () => {
	it('fills in whole days', () => {
		const parsed = createAbsenceSchema.parse({
			employeeId,
			type: 'vacation',
			startDate: '2026-12-21',
			endDate: '2026-12-31'
		});
		expect(parsed.halfDayStart).toBe(false);
		expect(parsed.halfDayEnd).toBe(false);
	});

	it('refuses a range that ends before it starts', () => {
		const parsed = createAbsenceSchema.safeParse({
			employeeId,
			type: 'vacation',
			startDate: '2026-12-21',
			endDate: '2026-12-20'
		});
		expect(parsed.success).toBe(false);
	});

	it('does not split a single day twice', () => {
		const single = { employeeId, type: 'time_off', startDate: '2026-11-06', endDate: '2026-11-06' };
		expect(createAbsenceSchema.safeParse({ ...single, halfDayStart: true }).success).toBe(true);
		expect(
			createAbsenceSchema.safeParse({ ...single, halfDayStart: true, halfDayEnd: true }).success
		).toBe(false);
	});
});

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
