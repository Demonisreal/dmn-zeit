import type { Temporal } from 'temporal-polyfill';
import type { Employment } from '../contracts';
import type { Explanation } from '../explanation';
import type { Fraction } from '../fraction';
import type { Holiday } from '../holidays';
import { notImplemented } from '../stub';

export type Entitlement = {
	exact: Fraction;
	// § 5 Abs. 2 BUrlG: from half a day up, never down
	rounded: Fraction;
	explanations: Explanation[];
};

export type VacationRange = {
	start: Temporal.PlainDate;
	end: Temporal.PlainDate;
	halfDayStart: boolean;
	halfDayEnd: boolean;
};

export type DayCost = {
	date: Temporal.PlainDate;
	portion: 0 | 0.5 | 1;
	targetMinutes: number;
	vacationDays: Fraction;
	explanation: Explanation;
};

export type Bucket = {
	year: number;
	remaining: Fraction;
	deadline: Temporal.PlainDate | null;
};

export type Allocation = {
	year: number;
	days: Fraction;
};

export type AllocationPlan = {
	allocations: Allocation[];
	shortfall: Fraction;
};

export type Notice = {
	sentAt: Temporal.Instant;
	deadline: Temporal.PlainDate;
};

export type Expiry = {
	kind: 'not_due' | 'forfeit' | 'keep';
	days: Fraction;
	explanation: Explanation;
};

export type TakenDay = {
	date: Temporal.PlainDate;
	vacationDays: Fraction;
};

export type SickRefund = {
	days: Fraction;
	dates: Temporal.PlainDate[];
	explanation: Explanation;
};

export const annualEntitlement: (employment: Employment, year: number) => Entitlement =
	notImplemented;
export const daysForRange: (
	range: VacationRange,
	employment: Employment,
	holidays: readonly Holiday[]
) => DayCost[] = notImplemented;
// buckets that expire before the first day do not count
export const allocate: (
	days: Fraction,
	buckets: readonly Bucket[],
	firstDay: Temporal.PlainDate
) => AllocationPlan = notImplemented;
export const expiryDecision: (
	bucket: Bucket,
	notice: Notice | null,
	today: Temporal.PlainDate
) => Expiry = notImplemented;
export const sickRefund: (
	taken: readonly TakenDay[],
	sickDates: readonly Temporal.PlainDate[]
) => SickRefund = notImplemented;
