import { fc, test } from '@fast-check/vitest';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
	gapsBetween,
	monthDays,
	splitByLocalDate,
	summarizeWorkday,
	workdayOf,
	type DaySlice,
	type EntrySpan,
	type Span
} from './index';

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

describe('gapsBetween', () => {
	it('lists the gaps between spans in start order', () => {
		const morning = span('2026-05-12T08:00', '2026-05-12T12:00');
		const afternoon = span('2026-05-12T12:30', '2026-05-12T15:00');
		const evening = span('2026-05-12T15:10', '2026-05-12T17:00');
		expect(gapsBetween([evening, morning, afternoon])).toEqual([
			span('2026-05-12T12:00', '2026-05-12T12:30'),
			span('2026-05-12T15:00', '2026-05-12T15:10')
		]);
	});

	it('finds no gap between touching spans or next to a single one', () => {
		const morning = span('2026-05-12T08:00', '2026-05-12T12:00');
		expect(gapsBetween([morning, span('2026-05-12T12:00', '2026-05-12T13:00')])).toEqual([]);
		expect(gapsBetween([morning])).toEqual([]);
		expect(gapsBetween([])).toEqual([]);
	});
});

const entry = (start: string, end: string | null): EntrySpan => ({
	start: local(start),
	end: end === null ? null : local(end)
});

describe('summarizeWorkday', () => {
	it('has nothing to report for a day without entries', () => {
		expect(summarizeWorkday([], local('2026-05-12T12:00'), BERLIN)).toEqual({
			workedMinutes: 0,
			breakMinutes: 0,
			gaps: [],
			firstStart: null,
			lastEnd: null,
			running: false
		});
	});

	it('adds up the entries and counts every gap between them as break', () => {
		const entries = [
			entry('2026-05-12T12:30', '2026-05-12T14:00'),
			entry('2026-05-12T08:00', '2026-05-12T12:00'),
			entry('2026-05-12T14:10', '2026-05-12T16:40')
		];
		expect(summarizeWorkday(entries, local('2026-05-12T18:00'), BERLIN)).toEqual({
			workedMinutes: 480,
			breakMinutes: 40,
			gaps: [
				span('2026-05-12T12:00', '2026-05-12T12:30'),
				span('2026-05-12T14:00', '2026-05-12T14:10')
			],
			firstStart: local('2026-05-12T08:00'),
			lastEnd: local('2026-05-12T16:40'),
			running: false
		});
	});

	it('closes a running entry at now', () => {
		const entries = [
			entry('2026-05-12T08:00', '2026-05-12T12:00'),
			entry('2026-05-12T12:30', null)
		];
		const summary = summarizeWorkday(entries, local('2026-05-12T14:15'), BERLIN);
		expect(summary).toMatchObject({
			workedMinutes: 345,
			breakMinutes: 30,
			lastEnd: local('2026-05-12T14:15'),
			running: true
		});
	});

	it('does not count a break that has not ended yet', () => {
		const summary = summarizeWorkday(
			[entry('2026-05-12T08:00', '2026-05-12T12:00')],
			local('2026-05-12T12:20'),
			BERLIN
		);
		expect(summary).toMatchObject({
			workedMinutes: 240,
			breakMinutes: 0,
			gaps: [],
			running: false
		});
	});

	it('rounds the seconds of the stamps to whole minutes', () => {
		const stamped = (text: string) => Temporal.Instant.from(text);
		const entries = [
			{ start: stamped('2026-05-12T06:00:00Z'), end: stamped('2026-05-12T10:00:20Z') },
			{ start: stamped('2026-05-12T10:30:10Z'), end: stamped('2026-05-12T14:30:00Z') }
		];
		const summary = summarizeWorkday(entries, stamped('2026-05-12T15:00:00Z'), BERLIN);
		expect([summary.workedMinutes, summary.breakMinutes]).toEqual([480, 30]);
	});

	it('keeps a night shift that runs past midnight on its workday', () => {
		const entries = [
			entry('2026-05-12T20:00', '2026-05-12T23:30'),
			entry('2026-05-12T23:45', '2026-05-13T04:00')
		];
		expect(summarizeWorkday(entries, local('2026-05-13T08:00'), BERLIN)).toMatchObject({
			workedMinutes: 465,
			breakMinutes: 15
		});
	});

	it('counts real minutes across the switch to summer time', () => {
		const night = [entry('2026-03-28T22:00', '2026-03-29T06:00')];
		expect(summarizeWorkday(night, local('2026-03-29T07:00'), BERLIN).workedMinutes).toBe(420);
	});

	it('refuses entries from two different workdays', () => {
		const entries = [
			entry('2026-05-12T08:00', '2026-05-12T12:00'),
			entry('2026-05-13T08:00', '2026-05-13T12:00')
		];
		expect(() => summarizeWorkday(entries, local('2026-05-13T13:00'), BERLIN)).toThrow(
			/not on workday 2026-05-12/
		);
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
		}
	);

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

// minute steps from 06:00 keep every start on the same local date
const stint = fc.record({
	gap: fc.integer({ min: 0, max: 60 }),
	length: fc.integer({ min: 1, max: 120 })
});
const stints = fc.array(stint, { minLength: 1, maxLength: 6 });

const lay = (plan: readonly { gap: number; length: number }[]): Span[] => {
	let cursor = local('2026-05-12T06:00');
	return plan.map(({ gap, length }) => {
		const start = cursor.add({ minutes: gap });
		cursor = start.add({ minutes: length });
		return { start, end: cursor };
	});
};

describe('summarizeWorkday properties', () => {
	test.prop([stints], { numRuns: 1000 })(
		'work and breaks fill the day from the first start to the last end',
		(plan) => {
			const entries = lay(plan);
			const summary = summarizeWorkday(entries.toReversed(), local('2026-05-13T12:00'), BERLIN);
			const spanned = summary.firstStart!.until(summary.lastEnd!).total('minutes');
			expect(summary.workedMinutes + summary.breakMinutes).toBe(spanned);
			expect(summary.workedMinutes).toBe(plan.reduce((sum, { length }) => sum + length, 0));
			expect(summary.gaps).toEqual(gapsBetween(entries));
		}
	);

	test.prop([stints, fc.integer({ min: 0, max: 600 })], { numRuns: 1000 })(
		'a running entry counts as if it had ended at now',
		(plan, minutesOpen) => {
			const entries = lay(plan);
			const open = entries.at(-1)!;
			const now = open.start.add({ minutes: minutesOpen });
			const running = summarizeWorkday(
				[...entries.slice(0, -1), { start: open.start, end: null }],
				now,
				BERLIN
			);
			const closed = summarizeWorkday(
				[...entries.slice(0, -1), { start: open.start, end: now }],
				now,
				BERLIN
			);
			expect(running).toEqual({ ...closed, running: true });
		}
	);
});
