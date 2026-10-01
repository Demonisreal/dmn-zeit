import { Temporal } from 'temporal-polyfill';

export type Span = {
	start: Temporal.Instant;
	end: Temporal.Instant;
};

export type DaySlice = Span & { date: Temporal.PlainDate };

export type EntrySpan = {
	start: Temporal.Instant;
	end: Temporal.Instant | null;
};

export type WorkdaySummary = {
	workedMinutes: number;
	breakMinutes: number;
	gaps: Span[];
	firstStart: Temporal.Instant | null;
	lastEnd: Temporal.Instant | null;
	running: boolean;
};

const byStart = (a: Span, b: Span) => Temporal.Instant.compare(a.start, b.start);

export const workdayOf = (start: Temporal.Instant, timeZone: string): Temporal.PlainDate =>
	start.toZonedDateTimeISO(timeZone).toPlainDate();

export const splitByLocalDate = (span: Span, timeZone: string): DaySlice[] => {
	const slices: DaySlice[] = [];
	let start = span.start;
	while (Temporal.Instant.compare(start, span.end) < 0) {
		const date = workdayOf(start, timeZone);
		const midnight = date.add({ days: 1 }).toZonedDateTime(timeZone).toInstant();
		const end = Temporal.Instant.compare(midnight, span.end) < 0 ? midnight : span.end;
		slices.push({ start, end, date });
		start = end;
	}
	return slices;
};

export const monthDays = (month: Temporal.PlainYearMonth): Temporal.PlainDate[] =>
	Array.from({ length: month.daysInMonth }, (_, i) => month.toPlainDate({ day: i + 1 }));

export const wholeMinutes = (spans: readonly Span[]): number =>
	Math.round(spans.reduce((sum, span) => sum + span.start.until(span.end).total('minutes'), 0));

export const gapsBetween = (spans: readonly Span[]): Span[] => {
	const gaps: Span[] = [];
	spans.toSorted(byStart).forEach((span, i, sorted) => {
		const previous = sorted[i - 1];
		if (previous && Temporal.Instant.compare(previous.end, span.start) < 0) {
			gaps.push({ start: previous.end, end: span.start });
		}
	});
	return gaps;
};

export const summarizeWorkday = (
	entries: readonly EntrySpan[],
	now: Temporal.Instant,
	timeZone: string
): WorkdaySummary => {
	const spans = entries.map(({ start, end }) => ({ start, end: end ?? now })).toSorted(byStart);
	const first = spans[0];
	const last = spans.at(-1);
	if (!first || !last) {
		return {
			workedMinutes: 0,
			breakMinutes: 0,
			gaps: [],
			firstStart: null,
			lastEnd: null,
			running: false
		};
	}
	const workday = workdayOf(first.start, timeZone);
	const stray = spans.find((span) => !workdayOf(span.start, timeZone).equals(workday));
	if (stray) {
		throw new Error(`summarizeWorkday: entry at ${stray.start} is not on workday ${workday}`);
	}

	const gaps = gapsBetween(spans);
	return {
		workedMinutes: wholeMinutes(spans),
		breakMinutes: wholeMinutes(gaps),
		gaps,
		firstStart: first.start,
		lastEnd: last.end,
		running: entries.some((entry) => entry.end === null)
	};
};
