import { Temporal } from 'temporal-polyfill';

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

export type OptionalHoliday = 'corpus_christi' | 'augsburg_peace' | 'assumption_day';

export type Holiday = {
	date: Temporal.PlainDate;
	code: HolidayCode;
	portion: 0.5 | 1;
};

export type HolidayOptions = {
	optional: readonly OptionalHoliday[];
	halfDays: boolean;
};

export const easterSunday = (year: number): Temporal.PlainDate => {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const n = h + l - 7 * m + 114;
	return Temporal.PlainDate.from({ year, month: Math.floor(n / 31), day: (n % 31) + 1 });
};

export const holidaysFor = (
	year: number,
	state: FederalState,
	options: HolidayOptions
): Holiday[] => {
	const easter = easterSunday(year);
	const on = (month: number, day: number) => Temporal.PlainDate.from({ year, month, day });
	const afterEaster = (days: number) => easter.add({ days });
	const oneOf = (...states: FederalState[]) => states.includes(state);
	const opted = (holiday: OptionalHoliday) => options.optional.includes(holiday);

	const holidays: Holiday[] = [];
	const add = (code: HolidayCode, date: Temporal.PlainDate, portion: 0.5 | 1 = 1) => {
		holidays.push({ date, code, portion });
	};

	add('new_year', on(1, 1));
	add('good_friday', afterEaster(-2));
	add('easter_monday', afterEaster(1));
	add('labour_day', on(5, 1));
	add('ascension_day', afterEaster(39));
	add('whit_monday', afterEaster(50));
	add('german_unity_day', on(10, 3));
	add('christmas_day', on(12, 25));
	add('boxing_day', on(12, 26));

	if (oneOf('BW', 'BY', 'ST')) {
		add('epiphany', on(1, 6));
	}
	if ((state === 'BE' && year >= 2019) || (state === 'MV' && year >= 2023)) {
		add('womens_day', on(3, 8));
	}
	if (state === 'BB') {
		add('easter_sunday', easter);
		add('whit_sunday', afterEaster(49));
	}
	if (state === 'BE' && (year === 2020 || year === 2025)) {
		add('liberation_day', on(5, 8));
	}
	if (oneOf('BW', 'BY', 'HE', 'NW', 'RP', 'SL') || (oneOf('SN', 'TH') && opted('corpus_christi'))) {
		add('corpus_christi', afterEaster(60));
	}
	if (state === 'BY' && opted('augsburg_peace')) {
		add('augsburg_peace', on(8, 8));
	}
	if (state === 'SL' || (state === 'BY' && opted('assumption_day'))) {
		add('assumption_day', on(8, 15));
	}
	if (state === 'TH' && year >= 2019) {
		add('world_childrens_day', on(9, 20));
	}
	if (
		year === 2017 ||
		oneOf('BB', 'MV', 'SN', 'ST', 'TH') ||
		(year >= 2018 && oneOf('HB', 'HH', 'NI', 'SH'))
	) {
		add('reformation_day', on(10, 31));
	}
	if (oneOf('BW', 'BY', 'NW', 'RP', 'SL')) {
		add('all_saints_day', on(11, 1));
	}
	if (state === 'SN') {
		const cutoff = on(11, 22);
		const wednesday = 3;
		add('repentance_day', cutoff.subtract({ days: (cutoff.dayOfWeek - wednesday + 7) % 7 }));
	}
	if (options.halfDays) {
		add('christmas_eve', on(12, 24), 0.5);
		add('new_years_eve', on(12, 31), 0.5);
	}

	return holidays.sort((a, b) => Temporal.PlainDate.compare(a.date, b.date));
};
