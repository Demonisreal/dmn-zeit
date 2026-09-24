import { Temporal } from 'temporal-polyfill';
import { gapsBetween, type Span } from '../calendar';
import type { Holiday } from '../holidays';

export type ArbzgCode =
	| 'ARBZG_3_OVER_8'
	| 'ARBZG_3_OVER_10'
	| 'ARBZG_4_BREAK_SHORT'
	| 'ARBZG_4_CONTINUOUS_6H'
	| 'ARBZG_5_REST_UNDER_11H'
	| 'ARBZG_9_SUNDAY'
	| 'ARBZG_9_HOLIDAY';

export type Severity = 'info' | 'warning';

export type Limits = {
	regularDailyMinutes: number;
	maxDailyMinutes: number;
	breakOver6hMinutes: number;
	breakOver9hMinutes: number;
	minBreakMinutes: number;
	maxContinuousMinutes: number;
	minRestMinutes: number;
};

export type RuleSet = {
	version: string;
	validFrom: Temporal.PlainDate;
	limits: Limits;
};

export type Workday = {
	date: Temporal.PlainDate;
	shifts: readonly Span[];
};

export type Finding = {
	code: ArbzgCode;
	severity: Severity;
	date: Temporal.PlainDate;
	ruleVersion: string;
	facts: Readonly<Record<string, number | string>>;
};

export type CheckContext = {
	timeZone: string;
	holidays: readonly Holiday[];
	// days before from only lead into the first rest period, nothing outside gets reported
	range: { from: Temporal.PlainDate; to: Temporal.PlainDate };
};

// a reform of the act becomes a new entry here, old findings keep the version they were made with
export const RULESETS: readonly RuleSet[] = [
	{
		version: 'arbzg-1994',
		validFrom: Temporal.PlainDate.from('1994-07-01'),
		limits: {
			regularDailyMinutes: 480,
			maxDailyMinutes: 600,
			breakOver6hMinutes: 30,
			breakOver9hMinutes: 45,
			minBreakMinutes: 15,
			maxContinuousMinutes: 360,
			minRestMinutes: 660
		}
	}
];

const byStart = (a: Span, b: Span) => Temporal.Instant.compare(a.start, b.start);
const minutesBetween = (from: Temporal.Instant, to: Temporal.Instant) =>
	from.until(to).total('minutes');

// nothing we store predates the act, so earlier dates simply get the oldest set
export const ruleSetFor = (date: Temporal.PlainDate): RuleSet =>
	RULESETS.toSorted((a, b) => Temporal.PlainDate.compare(a.validFrom, b.validFrom)).reduce(
		(current, set) => (Temporal.PlainDate.compare(set.validFrom, date) <= 0 ? set : current)
	);

export const groupWorkdays = (shifts: readonly Span[], timeZone: string): Workday[] => {
	const byDate = new Map<string, { date: Temporal.PlainDate; shifts: Span[] }>();
	for (const shift of shifts.toSorted(byStart)) {
		const date = shift.start.toZonedDateTimeISO(timeZone).toPlainDate();
		const workday = byDate.get(date.toString());
		if (workday) {
			workday.shifts.push(shift);
		} else {
			byDate.set(date.toString(), { date, shifts: [shift] });
		}
	}
	return [...byDate.values()];
};

export const checkWorkdays = (days: readonly Workday[], context: CheckContext): Finding[] => {
	const { from, to } = context.range;
	const findings: Finding[] = [];
	let previousEnd: Temporal.Instant | undefined;

	for (const day of days.toSorted((a, b) => Temporal.PlainDate.compare(a.date, b.date))) {
		const shifts = day.shifts.toSorted(byStart);
		const first = shifts[0];
		const last = shifts.at(-1);
		if (!first || !last) {
			continue;
		}
		const restMinutes = previousEnd ? minutesBetween(previousEnd, first.start) : null;
		previousEnd = last.end;
		if (
			Temporal.PlainDate.compare(day.date, from) < 0 ||
			Temporal.PlainDate.compare(day.date, to) > 0
		) {
			continue;
		}

		const { version, limits } = ruleSetFor(day.date);
		const flag = (code: ArbzgCode, severity: Severity, facts: Finding['facts'] = {}) => {
			findings.push({ code, severity, date: day.date, ruleVersion: version, facts });
		};

		if (restMinutes !== null && restMinutes < limits.minRestMinutes) {
			flag('ARBZG_5_REST_UNDER_11H', 'warning', { restMinutes });
		}

		const minutes = shifts.reduce((sum, shift) => sum + minutesBetween(shift.start, shift.end), 0);
		let breakMinutes = 0;
		let longest = 0;
		let stretchStart = first.start;
		let shortGaps = 0;
		for (const gap of gapsBetween(shifts)) {
			const length = minutesBetween(gap.start, gap.end);
			// § 4 ArbZG: gaps under 15 min are no break and do not end the stretch either
			if (length < limits.minBreakMinutes) {
				shortGaps += length;
				continue;
			}
			breakMinutes += length;
			longest = Math.max(longest, minutesBetween(stretchStart, gap.start) - shortGaps);
			stretchStart = gap.end;
			shortGaps = 0;
		}
		longest = Math.max(longest, minutesBetween(stretchStart, last.end) - shortGaps);

		if (minutes > limits.maxDailyMinutes) {
			flag('ARBZG_3_OVER_10', 'warning', { minutes });
		} else if (minutes > limits.regularDailyMinutes) {
			flag('ARBZG_3_OVER_8', 'info', { minutes });
		}

		const requiredMinutes =
			minutes > 9 * 60
				? limits.breakOver9hMinutes
				: minutes > 6 * 60
					? limits.breakOver6hMinutes
					: 0;
		if (breakMinutes < requiredMinutes) {
			flag('ARBZG_4_BREAK_SHORT', 'warning', { requiredMinutes, actualMinutes: breakMinutes });
		}
		if (longest > limits.maxContinuousMinutes) {
			flag('ARBZG_4_CONTINUOUS_6H', 'warning', { continuousMinutes: longest });
		}

		// 24.12. and 31.12. are company half days, § 9 only protects statutory holidays
		if (
			context.holidays.some((holiday) => holiday.portion === 1 && holiday.date.equals(day.date))
		) {
			flag('ARBZG_9_HOLIDAY', 'warning');
		}
		if (day.date.dayOfWeek === 7) {
			flag('ARBZG_9_SUNDAY', 'warning');
		}
	}

	// each code appears at most once per day, so two findings never tie
	return findings.sort(
		(a, b) => Temporal.PlainDate.compare(a.date, b.date) || (a.code < b.code ? -1 : 1)
	);
};
