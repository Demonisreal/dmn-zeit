import type { Temporal } from 'temporal-polyfill';
import { notImplemented } from '../stub';

export const FEDERAL_STATES = [
	'BW',
	'BY',
	'BE',
	'BB',
	'HB',
	'HH',
	'HE',
	'MV',
	'NI',
	'NW',
	'RP',
	'SL',
	'SN',
	'ST',
	'SH',
	'TH'
] as const;
export type FederalState = (typeof FEDERAL_STATES)[number];

export type HolidayCode =
	| 'new_year'
	| 'epiphany'
	| 'womens_day'
	| 'good_friday'
	| 'easter_sunday'
	| 'easter_monday'
	| 'labour_day'
	| 'liberation_day'
	| 'ascension_day'
	| 'whit_sunday'
	| 'whit_monday'
	| 'corpus_christi'
	| 'augsburg_peace'
	| 'assumption_day'
	| 'world_childrens_day'
	| 'german_unity_day'
	| 'reformation_day'
	| 'all_saints_day'
	| 'repentance_day'
	| 'christmas_eve'
	| 'christmas_day'
	| 'boxing_day'
	| 'new_years_eve';

// holidays that only some municipalities keep
export type OptionalHoliday = 'corpus_christi' | 'augsburg_peace' | 'assumption_day';

export type Holiday = {
	date: Temporal.PlainDate;
	code: HolidayCode;
	portion: 0.5 | 1;
};

export type HolidayOptions = {
	optional: readonly OptionalHoliday[];
	// 24.12. and 31.12. as half days
	halfDays: boolean;
};

export const easterSunday: (year: number) => Temporal.PlainDate = notImplemented;
export const holidaysFor: (
	year: number,
	state: FederalState,
	options: HolidayOptions
) => Holiday[] = notImplemented;
