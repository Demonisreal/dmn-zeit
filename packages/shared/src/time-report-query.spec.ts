import { describe, expect, it } from 'vitest';
import { timeReportQuerySchema } from './billing';

const query = { client: '6f1c2a5e-3b7d-4c1e-9a2f-0d4b8e6c1a37', format: 'csv' };

describe('timeReportQuerySchema', () => {
	it.each([
		['2026-04-01', '2026-04-30'],
		['2025-04-01', '2026-03-31'],
		['2027-04-01', '2028-03-31']
	])('takes %s to %s', (from, to) => {
		expect(timeReportQuerySchema.safeParse({ ...query, from, to }).success).toBe(true);
	});

	it('stops at 367 days', () => {
		expect(
			timeReportQuerySchema.safeParse({ ...query, from: '2026-04-01', to: '2027-04-02' }).error
				?.issues
		).toMatchObject([{ message: 'range.tooLong', path: ['to'], params: { max: 366 } }]);
	});

	it('stops an end before the start', () => {
		expect(
			timeReportQuerySchema.safeParse({ ...query, from: '2026-04-02', to: '2026-04-01' }).error
				?.issues
		).toMatchObject([{ message: 'range.unordered', path: ['to'] }]);
	});
});
