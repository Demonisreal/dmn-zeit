import { describe, expect, it } from 'vitest';
import { absenceSchema, absencesQuerySchema, createAbsenceSchema } from './absences';

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

describe('absenceSchema', () => {
	const absence = {
		id: '7a1b9c3d-2e4f-4b6a-9c8d-1e2f3a4b5c6d',
		employee: { id: employeeId, name: 'Jana Wolff' },
		type: 'vacation',
		startDate: '2026-12-21',
		endDate: '2026-12-31',
		halfDayStart: false,
		halfDayEnd: false,
		status: 'pending',
		note: null,
		vacationDays: '5.00',
		targetMinutes: 2400,
		requestedBy: { id: '3f6e8d2c-9b1a-4c7e-a5d4-8b3c2e1f0a9d', displayName: 'Jana Wolff' },
		decidedBy: null,
		decidedAt: null,
		decisionNote: null,
		sickNote: null,
		createdAt: '2026-11-02T09:14:00+01:00'
	};
	const away = {
		employee: { id: 'e2d4c6b8-a0f1-4e3d-8c5b-7a9f1e3d5c2b', name: 'Tom Brandt' },
		startDate: '2026-12-28',
		endDate: '2027-01-04'
	};

	it('still reads mine and all without the inbox extras', () => {
		const parsed = absenceSchema.parse(absence);
		expect(parsed).not.toHaveProperty('remainingAfter');
		expect(parsed).not.toHaveProperty('concurrentAbsences');
		expect(parsed).not.toHaveProperty('balanceAfterMinutes');
	});

	it('reads the inbox extras', () => {
		const timeOff = absenceSchema.parse({
			...absence,
			type: 'time_off',
			vacationDays: '0.00',
			remainingAfter: null,
			concurrentAbsences: [away],
			balanceAfterMinutes: -90
		});
		expect(timeOff).toMatchObject({
			remainingAfter: null,
			concurrentAbsences: [away],
			balanceAfterMinutes: -90
		});
		expect(absenceSchema.parse({ ...absence, remainingAfter: '12.50' }).remainingAfter).toBe(
			'12.50'
		);
	});

	it('does not pass on why a colleague is away', () => {
		const parsed = absenceSchema.parse({
			...absence,
			concurrentAbsences: [{ ...away, type: 'sick' }]
		});
		expect(parsed.concurrentAbsences?.[0]).toEqual(away);
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

	it('shows the inbox without a range', () => {
		expect(absencesQuerySchema.safeParse({ scope: 'inbox' }).success).toBe(true);
		expect(absencesQuerySchema.safeParse({ ...range, scope: 'inbox' }).success).toBe(true);
	});

	it.each(['mine', 'all'])('wants a range for %s', (scope) => {
		expect(absencesQuerySchema.safeParse({ scope }).error?.issues).toMatchObject([
			{ message: 'range.required', path: ['from'] }
		]);
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
