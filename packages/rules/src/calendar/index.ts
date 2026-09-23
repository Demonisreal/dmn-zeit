import type { Temporal } from 'temporal-polyfill';
import { notImplemented } from '../stub';

export type Span = {
	start: Temporal.Instant;
	end: Temporal.Instant;
};

export type DaySlice = Span & { date: Temporal.PlainDate };

// an entry belongs to the local date it started on, even when it runs past midnight
export const workdayOf: (start: Temporal.Instant, timeZone: string) => Temporal.PlainDate =
	notImplemented;
export const splitByLocalDate: (span: Span, timeZone: string) => DaySlice[] = notImplemented;
export const monthDays: (month: Temporal.PlainYearMonth) => Temporal.PlainDate[] = notImplemented;
