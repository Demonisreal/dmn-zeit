import { fc, test } from '@fast-check/vitest';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { monthDays, splitByLocalDate, workdayOf, type DaySlice } from './index';

const BERLIN = 'Europe/Berlin';
const HOUR = 60 * 60 * 1000;

const local = (text: string) => Temporal.ZonedDateTime.from(`${text}[${BERLIN}]`).toInstant();
const span = (start: string, end: string) => ({ start: local(start), end: local(end) });
const hours = (slice: DaySlice) =>
	(slice.end.epochMilliseconds - slice.start.epochMilliseconds) / HOUR;
const dates = (slices: DaySlice[]) => slices.map((slice) => slice.date.toString());

describe('workdayOf', () => {
	it('returns the local date the shift starts on', () => {
		expect(workdayOf(local('2026-06-30T23:30'), BERLIN).toString()).toBe('2026-06-30');
	});

	it('uses the local date even when utc is still on the previous day', () => {
		const start = Temporal.Instant.from('2026-06-30T22:30:00Z');
		expect(workdayOf(start, BERLIN).toString()).toBe('2026-07-01');
	});
});

describe('splitByLocalDate', () => {
	it('keeps a shift within one day as a single slice', () => {
		const shift = span('2026-05-12T08:00', '2026-05-12T16:30');
		const slices = splitByLocalDate(shift, BERLIN);
		expect(slices).toHaveLength(1);
		expect(slices[0]).toEqual({ ...shift, date: Temporal.PlainDate.from('2026-05-12') });
	});

	it('cuts a night shift at local midnight', () => {
		const slices = splitByLocalDate(span('2026-05-12T22:00', '2026-05-13T06:00'), BERLIN);
		expect(dates(slices)).toEqual(['2026-05-12', '2026-05-13']);
		expect(slices[0]?.end).toEqual(local('2026-05-13T00:00'));
		expect(slices[1]?.start).toEqual(local('2026-05-13T00:00'));
		expect(slices.map(hours)).toEqual([2, 6]);
	});

	it('treats 29 march as a 23-hour day', () => {
		const slices = splitByLocalDate(span('2026-03-29T00:00', '2026-03-30T00:00'), BERLIN);
		expect(dates(slices)).toEqual(['2026-03-29']);
		expect(slices.map(hours)).toEqual([23]);
	});

	it('treats 25 october as a 25-hour day', () => {
		const slices = splitByLocalDate(span('2026-10-25T00:00', '2026-10-26T00:00'), BERLIN);
		expect(dates(slices)).toEqual(['2026-10-25']);
		expect(slices.map(hours)).toEqual([25]);
	});

	it('splits a night shift into the short night of 29 march', () => {
		const slices = splitByLocalDate(span('2026-03-28T22:00', '2026-03-29T06:00'), BERLIN);
		expect(dates(slices)).toEqual(['2026-03-28', '2026-03-29']);
		expect(slices.map(hours)).toEqual([2, 5]);
	});

	it('splits a shift across the 25-hour day in october into two slices', () => {
		const slices = splitByLocalDate(span('2026-10-24T22:00', '2026-10-25T06:00'), BERLIN);
		expect(dates(slices)).toEqual(['2026-10-24', '2026-10-25']);
		expect(slices.map(hours)).toEqual([2, 7]);
	});

	it('cuts a span over several days into one slice per local date', () => {
		const slices = splitByLocalDate(span('2026-03-28T12:00', '2026-03-31T12:00'), BERLIN);
		expect(dates(slices)).toEqual(['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
		expect(slices.map(hours)).toEqual([12, 23, 24, 12]);
	});

	it('adds no empty slice when the span ends exactly at midnight', () => {
		const slices = splitByLocalDate(span('2026-05-12T18:00', '2026-05-13T00:00'), BERLIN);
		expect(dates(slices)).toEqual(['2026-05-12']);
	});

	it('returns nothing for a span without duration', () => {
		expect(splitByLocalDate(span('2026-05-12T08:00', '2026-05-12T08:00'), BERLIN)).toEqual([]);
	});
});

describe('monthDays', () => {
	it('lists every day of a month in order', () => {
		const days = monthDays(Temporal.PlainYearMonth.from('2026-03'));
		expect(days).toHaveLength(31);
		expect(days[0]?.toString()).toBe('2026-03-01');
		expect(days[30]?.toString()).toBe('2026-03-31');
	});

	it('knows about leap years', () => {
		expect(monthDays(Temporal.PlainYearMonth.from('2026-02'))).toHaveLength(28);
		expect(monthDays(Temporal.PlainYearMonth.from('2028-02'))).toHaveLength(29);
	});
});

const total = (slices: DaySlice[]) =>
	slices.reduce(
		(sum, slice) => sum + slice.end.epochMilliseconds - slice.start.epochMilliseconds,
		0
	);

const from2020 = local('2020-01-01T00:00').epochMilliseconds;
const until2036 = local('2036-01-01T00:00').epochMilliseconds;

// random starts over 16 years only rarely run into a clock change
const nearSwitch = fc
	.tuple(
		fc.constantFrom('2026-03-29', '2026-10-25'),
		fc.integer({ min: -24 * HOUR, max: 24 * HOUR })
	)
	.map(([day, offsetMs]) => local(`${day}T00:00`).epochMilliseconds + offsetMs);

describe('splitByLocalDate properties', () => {
	test.prop(
		[fc.integer({ min: from2020, max: until2036 }), fc.integer({ min: 0, max: 5 * 24 * HOUR })],
		{ numRuns: 1000 }
	)('slices add up to the whole span', (startMs, durationMs) => {
		const start = Temporal.Instant.fromEpochMilliseconds(startMs);
		const end = Temporal.Instant.fromEpochMilliseconds(startMs + durationMs);
		expect(total(splitByLocalDate({ start, end }, BERLIN))).toBe(durationMs);
	});

	test.prop([nearSwitch, fc.integer({ min: 0, max: 48 * HOUR })], { numRuns: 1000 })(
		'slices add up to the whole span on 29 march and 25 october',
		(startMs, durationMs) => {
			const start = Temporal.Instant.fromEpochMilliseconds(startMs);
		const end = Temporal.Instant.fromEpochMilliseconds(startMs + durationMs);
		expect(total(splitByLocalDate({ start, end }, BERLIN))).toBe(durationMs);
	});

	test.prop(
		[
			fc.oneof(fc.integer({ min: from2020, max: until2036 }), nearSwitch),
			fc.integer({ min: 1, max: 5 * 24 * HOUR })
		],
		{ numRuns: 1000 }
	)('slices follow each other with exactly one slice per local date', (startMs, durationMs) => {
		const start = Temporal.Instant.fromEpochMilliseconds(startMs);
		const end = Temporal.Instant.fromEpochMilliseconds(startMs + durationMs);
		const slices = splitByLocalDate({ start, end }, BERLIN);
		expect(slices[0]?.start).toEqual(start);
		expect(slices.at(-1)?.end).toEqual(end);
		slices.forEach((slice, i) => {
			expect(workdayOf(slice.start, BERLIN)).toEqual(slice.date);
			const lastInstant = slice.end.subtract({ nanoseconds: 1 });
			expect(workdayOf(lastInstant, BERLIN)).toEqual(slice.date);
			const previous = slices[i - 1];
			if (previous) {
				expect(slice.start).toEqual(previous.end);
				expect(slice.date).toEqual(previous.date.add({ days: 1 }));
			}
		});
	});
});
