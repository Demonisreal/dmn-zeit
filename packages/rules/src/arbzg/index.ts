import { Temporal } from 'temporal-polyfill';
import { gapsBetween, wholeMinutes, workdayOf, type Span } from '../calendar';
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

// the entries of one shift, dated by the local day the shift began
export type Shift = {
	date: Temporal.PlainDate;
	entries: readonly Span[];
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
	// shifts before from only lead into the first rest period, nothing outside gets reported
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

// shorter gaps are breaks within the shift, also past midnight
const SHIFT_GAP_MINUTES = 180;

const byStart = (a: Span, b: Span) => Temporal.Instant.compare(a.start, b.start);

// nothing we store predates the act, so earlier dates simply get the oldest set
export const ruleSetFor = (date: Temporal.PlainDate): RuleSet =>
	RULESETS.toSorted((a, b) => Temporal.PlainDate.compare(a.validFrom, b.validFrom)).reduce(
		(current, set) => (Temporal.PlainDate.compare(set.validFrom, date) <= 0 ? set : current)
	);

export const groupShifts = (entries: readonly Span[], timeZone: string): Shift[] => {
	const shifts: { date: Temporal.PlainDate; entries: Span[] }[] = [];
	for (const entry of entries.toSorted(byStart)) {
		const date = workdayOf(entry.start, timeZone);
		const current = shifts.at(-1);
		const previous = current?.entries.at(-1);
		// a split shift on one date stays together, otherwise findings would repeat for that day
		if (
			current &&
			previous &&
			(current.date.equals(date) ||
				wholeMinutes([{ start: previous.end, end: entry.start }]) < SHIFT_GAP_MINUTES)
		) {
			current.entries.push(entry);
		} else {
			shifts.push({ date, entries: [entry] });
		}
	}
	return shifts;
};

export const checkShifts = (shifts: readonly Shift[], context: CheckContext): Finding[] => {
	const { from, to } = context.range;
	const findings: Finding[] = [];
	let previousEnd: Temporal.Instant | undefined;

	for (const shift of shifts.toSorted((a, b) => Temporal.PlainDate.compare(a.date, b.date))) {
		const entries = shift.entries.toSorted(byStart);
		const first = entries[0];
		const last = entries.at(-1);
		if (!first || !last) {
			continue;
		}
		const restMinutes = previousEnd
			? wholeMinutes([{ start: previousEnd, end: first.start }])
			: null;
		previousEnd = last.end;
		if (
			Temporal.PlainDate.compare(shift.date, from) < 0 ||
			Temporal.PlainDate.compare(shift.date, to) > 0
		) {
			continue;
		}

		const { version, limits } = ruleSetFor(shift.date);
		const flag = (code: ArbzgCode, severity: Severity, facts: Finding['facts'] = {}) => {
			findings.push({ code, severity, date: shift.date, ruleVersion: version, facts });
		};

		if (restMinutes !== null && restMinutes < limits.minRestMinutes) {
			flag('ARBZG_5_REST_UNDER_11H', 'warning', { restMinutes });
		}

		const minutes = wholeMinutes(entries);
		// § 4 ArbZG: gaps under 15 min are no break and do not end a stretch either
		const breaks = gapsBetween(entries).filter(
			(gap) => wholeMinutes([gap]) >= limits.minBreakMinutes
		);
		const breakMinutes = wholeMinutes(breaks);
		const stretches: Span[][] = [];
		for (const entry of entries) {
			const stretch = stretches.at(-1);
			if (stretch && !breaks.some((gap) => gap.end.equals(entry.start))) {
				stretch.push(entry);
			} else {
				stretches.push([entry]);
			}
		}
		const longest = Math.max(...stretches.map((stretch) => wholeMinutes(stretch)));

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
			context.holidays.some((holiday) => holiday.portion === 1 && holiday.date.equals(shift.date))
		) {
			flag('ARBZG_9_HOLIDAY', 'warning');
		}
		if (shift.date.dayOfWeek === 7) {
			flag('ARBZG_9_SUNDAY', 'warning');
		}
	}

	// groupShifts never puts two shifts on one date, so each code appears at most once per day
	return findings.sort(
		(a, b) => Temporal.PlainDate.compare(a.date, b.date) || (a.code < b.code ? -1 : 1)
	);
};
