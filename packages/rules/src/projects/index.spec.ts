import { fc, test } from '@fast-check/vitest';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { wholeMinutes, type EntrySpan, type Span } from '../calendar';
import {
	COVERAGE_TOLERANCE_MINUTES,
	projectCoverage,
	TIMER_HINT_AFTER_MINUTES,
	timerHint
} from './index';

const BERLIN = 'Europe/Berlin';
const local = (text: string) => Temporal.ZonedDateTime.from(`${text}[${BERLIN}]`).toInstant();
const span = (start: string, end: string | null): EntrySpan => ({
	start: local(start),
	end: end === null ? null : local(end)
});
const context = { now: local('2026-05-12T20:00'), timeZone: BERLIN };

describe('projectCoverage', () => {
	const work = [
		span('2026-05-12T08:00', '2026-05-12T12:00'),
		span('2026-05-12T12:30', '2026-05-12T16:30')
	];

	it('counts work without a project as unassigned', () => {
		const coverage = projectCoverage(
			[span('2026-05-12T08:00', '2026-05-12T12:00'), span('2026-05-12T12:30', '2026-05-12T16:00')],
			work,
			context
		);
		expect(coverage).toEqual({
			projectMinutes: 450,
			workedMinutes: 480,
			coveredMinutes: 450,
			outsideMinutes: 0,
			unassignedMinutes: 30,
			hints: [],
			facts: { toleranceMinutes: COVERAGE_TOLERANCE_MINUTES, outside: [] }
		});
	});

	it('flags project time during a stamped break', () => {
		const coverage = projectCoverage([span('2026-05-12T11:00', '2026-05-12T13:00')], work, context);
		expect(coverage).toMatchObject({
			projectMinutes: 120,
			coveredMinutes: 90,
			outsideMinutes: 30,
			unassignedMinutes: 390,
			hints: ['PROJECT_OUTSIDE_WORK']
		});
		expect(coverage.facts.outside).toEqual([
			{ start: local('2026-05-12T12:00'), end: local('2026-05-12T12:30') }
		]);
	});

	it('finds project time before the first and after the last stamp', () => {
		const coverage = projectCoverage(
			[span('2026-05-12T07:00', '2026-05-12T08:30'), span('2026-05-12T16:00', '2026-05-12T17:00')],
			work,
			context
		);
		expect(coverage.facts.outside).toEqual([
			{ start: local('2026-05-12T07:00'), end: local('2026-05-12T08:00') },
			{ start: local('2026-05-12T16:30'), end: local('2026-05-12T17:00') }
		]);
		expect(coverage.outsideMinutes).toBe(90);
	});

	it('stays quiet within the tolerance for the order of the clicks', () => {
		const coverage = projectCoverage(
			[span('2026-05-12T07:57', '2026-05-12T12:00'), span('2026-05-12T12:28', '2026-05-12T16:30')],
			work,
			context
		);
		expect(coverage.outsideMinutes).toBe(5);
		expect(coverage.hints).toEqual([]);
	});

	it('flags more project time than time worked', () => {
		const coverage = projectCoverage(
			[span('2026-05-12T07:00', '2026-05-12T12:00'), span('2026-05-12T12:00', '2026-05-12T18:00')],
			work,
			context
		);
		expect(coverage).toMatchObject({
			projectMinutes: 660,
			workedMinutes: 480,
			coveredMinutes: 480,
			outsideMinutes: 180,
			unassignedMinutes: 0,
			hints: ['PROJECT_OVER_WORKED', 'PROJECT_OUTSIDE_WORK']
		});
	});

	it('puts all project time outside on a day without stamps', () => {
		const coverage = projectCoverage([span('2026-05-16T10:00', '2026-05-16T12:00')], [], context);
		expect(coverage).toMatchObject({
			projectMinutes: 120,
			workedMinutes: 0,
			coveredMinutes: 0,
			outsideMinutes: 120,
			unassignedMinutes: 0
		});
		expect(coverage.facts.outside).toHaveLength(1);
	});

	it('is empty without any spans', () => {
		expect(projectCoverage([], [], context)).toMatchObject({
			projectMinutes: 0,
			workedMinutes: 0,
			coveredMinutes: 0,
			hints: []
		});
	});

	it('closes running spans with now', () => {
		const coverage = projectCoverage(
			[span('2026-05-12T09:00', null)],
			[span('2026-05-12T08:00', null)],
			{ now: local('2026-05-12T10:00'), timeZone: BERLIN }
		);
		expect(coverage).toMatchObject({ projectMinutes: 60, workedMinutes: 120, coveredMinutes: 60 });
	});

	it('counts the short night of 29 march with its real length', () => {
		const night = [span('2026-03-29T01:00', '2026-03-29T04:00')];
		expect(projectCoverage(night, night, context)).toMatchObject({
			projectMinutes: 120,
			workedMinutes: 120,
			coveredMinutes: 120
		});
	});

	it('counts the long night of 25 october with its real length', () => {
		const night = [span('2026-10-25T01:00', '2026-10-25T04:00')];
		expect(projectCoverage(night, night, context)).toMatchObject({
			projectMinutes: 240,
			coveredMinutes: 240
		});
	});

	it('rejects spans from different workdays', () => {
		expect(() =>
			projectCoverage(
				[
					span('2026-05-12T09:00', '2026-05-12T10:00'),
					span('2026-05-13T09:00', '2026-05-13T10:00')
				],
				[],
				context
			)
		).toThrow('summarizeWorkday');
	});
});

describe('timerHint', () => {
	const startedAt = local('2026-05-11T16:40');

	it('stays silent before twelve hours', () => {
		expect(timerHint(startedAt, local('2026-05-12T04:39:59'))).toBe(false);
	});

	it('shows from twelve hours on', () => {
		expect(timerHint(startedAt, local('2026-05-12T04:40'))).toBe(true);
		expect(timerHint(startedAt, local('2026-05-12T08:30'))).toBe(true);
	});
});

const block = fc.record({
	gap: fc.integer({ min: 0, max: 120 }),
	length: fc.integer({ min: 1, max: 180 })
});

// minutes from local midnight, a start past day's end would belong to the next day and is dropped
const lay = (
	midnight: Temporal.Instant,
	dayMinutes: number,
	plan: readonly { gap: number; length: number }[]
) => {
	let cursor = 0;
	return plan.flatMap(({ gap, length }): Span[] => {
		const start = cursor + gap;
		if (start >= dayMinutes) {
			return [];
		}
		cursor = start + length;
		return [{ start: midnight.add({ minutes: start }), end: midnight.add({ minutes: cursor }) }];
	});
};

const open = (spans: Span[], running: boolean): EntrySpan[] =>
	running && spans.length > 0
		? [...spans.slice(0, -1), { start: spans.at(-1)!.start, end: null }]
		: spans;

const anyWorkday = fc
	.record({
		day: fc.constantFrom('2026-05-12', '2026-03-29', '2026-10-25'),
		project: fc.array(block, { maxLength: 6 }),
		work: fc.array(block, { maxLength: 6 }),
		projectRunning: fc.boolean(),
		workRunning: fc.boolean(),
		later: fc.integer({ min: 0, max: 120 })
	})
	.map(({ day, project, work, projectRunning, workRunning, later }) => {
		const midnight = local(`${day}T00:00`);
		const dayMinutes = midnight
			.until(local(`${Temporal.PlainDate.from(day).add({ days: 1 })}T00:00`))
			.total('minutes');
		const projectSpans = lay(midnight, dayMinutes, project);
		const workSpans = lay(midnight, dayMinutes, work);
		const lastEnd = [...projectSpans, ...workSpans]
			.map((span) => span.end)
			.toSorted(Temporal.Instant.compare)
			.at(-1);
		return {
			projectSpans: open(projectSpans, projectRunning),
			workSpans: open(workSpans, workRunning),
			context: { now: (lastEnd ?? midnight).add({ minutes: later }), timeZone: BERLIN }
		};
	});

describe('projectCoverage properties', () => {
	test.prop([anyWorkday], { numRuns: 1000 })(
		'covered, outside and unassigned minutes add up, on 29 march and 25 october and while running',
		({ projectSpans, workSpans, context }) => {
			const coverage = projectCoverage(projectSpans, workSpans, context);
			expect(coverage.coveredMinutes + coverage.outsideMinutes).toBe(coverage.projectMinutes);
			expect(coverage.coveredMinutes + coverage.unassignedMinutes).toBe(coverage.workedMinutes);
			expect(coverage.coveredMinutes).toBeLessThanOrEqual(
				Math.min(coverage.projectMinutes, coverage.workedMinutes)
			);
			expect(coverage.coveredMinutes).toBeGreaterThanOrEqual(0);
		}
	);

	test.prop([anyWorkday], { numRuns: 1000 })(
		'with whole-minute stamps the outside intervals add up to the outside minutes',
		({ projectSpans, workSpans, context }) => {
			const coverage = projectCoverage(projectSpans, workSpans, context);
			expect(wholeMinutes(coverage.facts.outside)).toBe(coverage.outsideMinutes);
		}
	);

	test.prop([anyWorkday], { numRuns: 1000 })(
		'project time booked exactly on the stamped time is covered completely',
		({ workSpans, context }) => {
			const coverage = projectCoverage(workSpans, workSpans, context);
			expect(coverage).toMatchObject({
				coveredMinutes: coverage.workedMinutes,
				outsideMinutes: 0,
				unassignedMinutes: 0,
				hints: []
			});
		}
	);
});

const nearTwelveHours = fc
	.integer({ min: -120, max: 120 })
	.map((seconds) => TIMER_HINT_AFTER_MINUTES * 60 + seconds);

describe('timerHint properties', () => {
	test.prop([fc.oneof(fc.integer({ min: 0, max: 3 * 24 * 3600 }), nearTwelveHours)], {
		numRuns: 1000
	})('the hint shows from twelve elapsed hours on, across the long night too', (seconds) => {
		const startedAt = local('2026-10-24T20:00');
		expect(timerHint(startedAt, startedAt.add({ seconds }))).toBe(
			seconds >= TIMER_HINT_AFTER_MINUTES * 60
		);
	});
});
