import { Temporal } from 'temporal-polyfill';
import type { Span } from '../calendar';
import { notImplemented } from '../stub';

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
	holidays: readonly Temporal.PlainDate[];
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

export const ruleSetFor: (date: Temporal.PlainDate) => RuleSet = notImplemented;
export const groupWorkdays: (shifts: readonly Span[], timeZone: string) => Workday[] =
	notImplemented;
export const checkWorkdays: (days: readonly Workday[], context: CheckContext) => Finding[] =
	notImplemented;
