import { Temporal } from 'temporal-polyfill';
import {
	gapsBetween,
	summarizeWorkday,
	wholeMinutes,
	type EntrySpan,
	type Span
} from '../calendar';

export type CoverageHint = 'PROJECT_OVER_WORKED' | 'PROJECT_OUTSIDE_WORK';

export type Coverage = {
	projectMinutes: number;
	workedMinutes: number;
	coveredMinutes: number;
	outsideMinutes: number;
	unassignedMinutes: number;
	hints: readonly CoverageHint[];
	facts: {
		toleranceMinutes: number;
		outside: readonly Span[];
	};
};

export const COVERAGE_TOLERANCE_MINUTES = 5;

export const TIMER_HINT_AFTER_MINUTES = 720;

const EARLIEST = Temporal.Instant.fromEpochMilliseconds(-8.64e15);
const LATEST = Temporal.Instant.fromEpochMilliseconds(8.64e15);

const later = (a: Temporal.Instant, b: Temporal.Instant) =>
	Temporal.Instant.compare(a, b) >= 0 ? a : b;
const earlier = (a: Temporal.Instant, b: Temporal.Instant) =>
	Temporal.Instant.compare(a, b) <= 0 ? a : b;

const overlaps = (a: readonly Span[], b: readonly Span[]): Span[] =>
	a.flatMap((x) =>
		b.flatMap((y) => {
			const start = later(x.start, y.start);
			const end = earlier(x.end, y.end);
			return Temporal.Instant.compare(start, end) < 0 ? [{ start, end }] : [];
		})
	);

export const projectCoverage = (
	projectSpans: readonly EntrySpan[],
	workSpans: readonly EntrySpan[],
	{ now, timeZone }: { now: Temporal.Instant; timeZone: string }
): Coverage => {
	const projectMinutes = summarizeWorkday(projectSpans, now, timeZone).workedMinutes;
	const workedMinutes = summarizeWorkday(workSpans, now, timeZone).workedMinutes;
	const projects = projectSpans.map(({ start, end }) => ({ start, end: end ?? now }));
	const work = workSpans.map(({ start, end }) => ({ start, end: end ?? now }));

	const coveredMinutes = wholeMinutes(overlaps(projects, work));
	const outsideMinutes = projectMinutes - coveredMinutes;
	const offWork = gapsBetween([
		{ start: EARLIEST, end: EARLIEST },
		...work,
		{ start: LATEST, end: LATEST }
	]);

	const hints: CoverageHint[] = [];
	if (projectMinutes - workedMinutes > COVERAGE_TOLERANCE_MINUTES) {
		hints.push('PROJECT_OVER_WORKED');
	}
	if (outsideMinutes > COVERAGE_TOLERANCE_MINUTES) {
		hints.push('PROJECT_OUTSIDE_WORK');
	}
	return {
		projectMinutes,
		workedMinutes,
		coveredMinutes,
		outsideMinutes,
		unassignedMinutes: workedMinutes - coveredMinutes,
		hints,
		facts: {
			toleranceMinutes: COVERAGE_TOLERANCE_MINUTES,
			outside: overlaps(projects, offWork)
		}
	};
};

export const timerHint = (startedAt: Temporal.Instant, now: Temporal.Instant): boolean =>
	Temporal.Instant.compare(now, startedAt.add({ minutes: TIMER_HINT_AFTER_MINUTES })) >= 0;
