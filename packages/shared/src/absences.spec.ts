import { describe, expect, it } from 'vitest';
import { absencesQuerySchema, createAbsenceSchema } from './absences';

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

describe('absencesQuerySchema', () => {
	const range = { from: '2026-01-01', to: '2026-12-31' };

	it('reads the status list both ways', () => {
		expect(
			absencesQuerySchema.parse({ ...range, status: 'pending,cancel_pending' }).status
		).toEqual(['pending', 'cancel_pending']);
		expect(absencesQuerySchema.parse({ ...range, status: ['approved'] }).status).toEqual([
			'approved'
		]);
		expect(absencesQuerySchema.safeParse({ ...range, status: 'pending,maybe' }).success).toBe(
			false
		);
	});

	it('needs a range and pages by default', () => {
		expect(absencesQuerySchema.safeParse({}).success).toBe(false);
		const parsed = absencesQuerySchema.parse(range);
		expect(parsed.scope).toBe('mine');
		expect(parsed.limit).toBe(50);
		expect(parsed.status).toBeUndefined();
	});

	it('stops at a year', () => {
		expect(absencesQuerySchema.safeParse({ from: '2028-01-01', to: '2028-12-31' }).success).toBe(
			true
		);
		expect(absencesQuerySchema.safeParse({ from: '2026-01-01', to: '2027-01-02' }).success).toBe(
			false
		);
	});
});
