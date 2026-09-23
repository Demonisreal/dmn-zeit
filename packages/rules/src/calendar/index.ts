import { Temporal } from 'temporal-polyfill';

export type Span = {
	start: Temporal.Instant;
	end: Temporal.Instant;
};

export type DaySlice = Span & { date: Temporal.PlainDate };

// an entry belongs to the local date it started on, even when it runs past midnight
export const workdayOf = (start: Temporal.Instant, timeZone: string): Temporal.PlainDate =>
	start.toZonedDateTimeISO(timeZone).toPlainDate();

export const splitByLocalDate = (span: Span, timeZone: string): DaySlice[] => {
	const slices: DaySlice[] = [];
	let start = span.start;
	while (Temporal.Instant.compare(start, span.end) < 0) {
		const date = workdayOf(start, timeZone);
		// next local midnight instead of start + 24h, the clock change makes days 23 or 25 hours long
		const midnight = date.add({ days: 1 }).toZonedDateTime(timeZone).toInstant();
		const end = Temporal.Instant.compare(midnight, span.end) < 0 ? midnight : span.end;
		slices.push({ start, end, date });
		start = end;
	}
	return slices;
};

export const monthDays = (month: Temporal.PlainYearMonth): Temporal.PlainDate[] =>
	Array.from({ length: month.daysInMonth }, (_, i) => month.toPlainDate({ day: i + 1 }));
