import type { FlexBooking } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { buildDays } from './day-engine';
import { flexBalance } from './flex-balance';
import type { Sheet, TenantSettings } from './time.store';

const tenant: TenantSettings = {
	state: 'NW',
	holidayOptions: [],
	halfDays: false,
	flexCap: { plusMinutes: null, minusMinutes: null },
	flexCapMode: 'none'
};

const sheet: Sheet = {
	employee: {
		id: 'e1',
		name: 'Erika Muster',
		entryDate: '2025-01-01',
		exitDate: null,
		closedThrough: null
	},
	contracts: [
		{
			validFrom: '2025-01-01',
			minutes: { mon: 480, tue: 480, wed: 480, thu: 480, fri: 480, sat: 0, sun: 0 },
			vacationDaysYear: '30.0',
			vacationBasisDays: 5,
			flexCap: null
		}
	],
	entries: [],
	absences: [],
	acks: []
};

let lastId = 0;
function manual(employeeId: string, minutes: number, effectiveDate: string): FlexBooking {
	return {
		id: `30000000-0000-4000-8000-${String(++lastId).padStart(12, '0')}`,
		employeeId,
		type: 'manual',
		minutes,
		effectiveDate,
		reason: 'Nachtrag',
		monthClosingId: null,
		createdBy: null,
		createdAt: '2026-01-02T08:00:00Z'
	};
}

describe('flexBalance', () => {
	// monday to wednesday without a single entry, each test picks the day it counts up to
	const days = buildDays(
		sheet,
		tenant,
		{ from: '2026-01-05', to: '2026-01-07' },
		new Date('2026-01-08T12:00:00Z')
	);
	const bookings = [
		manual('e1', 60, '2026-01-05'),
		manual('e1', 30, '2026-01-07'),
		manual('e2', 500, '2026-01-05')
	];

	it('counts days and bookings of the one person up to the same day', () => {
		const flex = flexBalance(sheet, days, bookings, new Map(), '2026-01-06');
		expect(flex.balanceMinutes).toBe(-960 + 60);
		expect(flex.months.map((month) => month.bookedMinutes)).toEqual([60]);
	});

	it('counts a booking that takes effect on the day of the balance', () => {
		const flex = flexBalance(sheet, days, bookings, new Map(), '2026-01-07');
		expect(flex.balanceMinutes).toBe(-1440 + 60 + 30);
	});

	it('puts the closed december on top of the balance and of every month', () => {
		const flex = flexBalance(sheet, days, bookings, new Map([['e1', 120]]), '2026-01-06');
		expect(flex.openingMinutes).toBe(0);
		expect(flex.balanceMinutes).toBe(-960 + 60 + 120);
		expect(flex.months.map((month) => month.balanceMinutes)).toEqual([-960 + 60 + 120]);
	});
});
