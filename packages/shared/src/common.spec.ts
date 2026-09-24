import { describe, expect, it } from 'vitest';
import {
	dayCountSchema,
	instantSchema,
	isoDateSchema,
	monthSchema,
	queryYearSchema
} from './common';
import { hasRole } from './roles';

describe('isoDateSchema', () => {
	it('knows leap years', () => {
		expect(isoDateSchema.safeParse('2028-02-29').success).toBe(true);
		expect(isoDateSchema.safeParse('2027-02-29').success).toBe(false);
		expect(isoDateSchema.safeParse('2100-02-29').success).toBe(false);
	});

	it('wants the short form', () => {
		expect(isoDateSchema.safeParse('2026-3-9').success).toBe(false);
		expect(isoDateSchema.safeParse('2026-03-09T00:00:00Z').success).toBe(false);
	});

	it('refuses days the month does not have', () => {
		expect(isoDateSchema.safeParse('2026-02-30').success).toBe(false);
		expect(isoDateSchema.safeParse('2026-02-28').success).toBe(true);
		expect(isoDateSchema.safeParse('2024-02-29').success).toBe(true);
	});

	it('stays between 1900 and 2100', () => {
		expect(isoDateSchema.safeParse('0000-01-01').success).toBe(false);
		expect(isoDateSchema.safeParse('9999-12-31').success).toBe(false);
		expect(isoDateSchema.safeParse('1899-12-31').success).toBe(false);
		expect(isoDateSchema.safeParse('1900-01-01').success).toBe(true);
		expect(isoDateSchema.safeParse('2100-12-31').success).toBe(true);
	});
});

describe('instantSchema', () => {
	it('accepts both sides of the clock change', () => {
		expect(instantSchema.safeParse('2026-03-29T01:59:00+01:00').success).toBe(true);
		expect(instantSchema.safeParse('2026-03-29T03:00:00+02:00').success).toBe(true);
		expect(instantSchema.safeParse('2026-03-29T01:00:00.123456Z').success).toBe(true);
	});

	it('refuses a stamp without offset', () => {
		expect(instantSchema.safeParse('2026-03-29T02:30:00').success).toBe(false);
	});

	it('checks the date part like a date', () => {
		expect(instantSchema.safeParse('2026-02-30T08:00:00+01:00').success).toBe(false);
		expect(instantSchema.safeParse('0000-01-01T00:00:00Z').success).toBe(false);
		expect(instantSchema.safeParse('9999-12-31T23:59:59+01:00').success).toBe(false);
	});
});

describe('monthSchema', () => {
	it('takes YYYY-MM only', () => {
		expect(monthSchema.safeParse('2026-09').success).toBe(true);
		expect(monthSchema.safeParse('2026-13').success).toBe(false);
		expect(monthSchema.safeParse('2026-9').success).toBe(false);
	});

	it('knows the same years as a date', () => {
		expect(monthSchema.safeParse('0000-01').success).toBe(false);
		expect(monthSchema.safeParse('9999-12').success).toBe(false);
		expect(monthSchema.safeParse('2100-12').success).toBe(true);
	});
});

describe('queryYearSchema', () => {
	it('turns the query string into a number', () => {
		expect(queryYearSchema.parse('2026')).toBe(2026);
		expect(queryYearSchema.safeParse('20.5').success).toBe(false);
		expect(queryYearSchema.safeParse('abc').success).toBe(false);
	});
});

describe('dayCountSchema', () => {
	it('keeps exactly two decimals', () => {
		expect(dayCountSchema.safeParse('12.50').success).toBe(true);
		expect(dayCountSchema.safeParse('-2.00').success).toBe(true);
		expect(dayCountSchema.safeParse('12.5').success).toBe(false);
		expect(dayCountSchema.safeParse('12').success).toBe(false);
	});
});

describe('hasRole', () => {
	it('lets higher roles pass for lower ones', () => {
		expect(hasRole('admin', 'hr')).toBe(true);
		expect(hasRole('hr', 'hr')).toBe(true);
		expect(hasRole('team_lead', 'hr')).toBe(false);
		expect(hasRole('employee', 'team_lead')).toBe(false);
	});
});
