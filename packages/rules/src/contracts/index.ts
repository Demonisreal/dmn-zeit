import type { Temporal } from 'temporal-polyfill';
import type { Explanation } from '../explanation';
import type { Fraction } from '../fraction';
import type { Holiday } from '../holidays';
import { notImplemented } from '../stub';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type WeekdayMinutes = Readonly<Record<Weekday, number>>;

// null means no limit in that direction
export type FlexCap = {
	plusMinutes: number | null;
	minusMinutes: number | null;
};

export type Contract = {
	validFrom: Temporal.PlainDate;
	minutes: WeekdayMinutes;
	vacationDaysYear: Fraction;
	vacationBasisDays: number;
	capOverride: FlexCap | null;
};

export type Employment = {
	entryDate: Temporal.PlainDate;
	exitDate: Temporal.PlainDate | null;
	contracts: readonly Contract[];
};

export type Target = {
	minutes: number;
	explanation: Explanation;
};

export const contractOn: (
	employment: Employment,
	date: Temporal.PlainDate
) => Contract | undefined = notImplemented;
export const targetMinutes: (
	employment: Employment,
	date: Temporal.PlainDate,
	holiday: Holiday | null
) => Target = notImplemented;
