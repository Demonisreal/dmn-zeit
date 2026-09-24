import { fc, test } from '@fast-check/vitest';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
	easterSunday,
	FEDERAL_STATES,
	holidaysFor,
	type FederalState,
	type HolidayCode,
	type HolidayOptions
} from './index';

const plain: HolidayOptions = { optional: [], halfDays: false };

const codes = (year: number, state: FederalState, options = plain) =>
	holidaysFor(year, state, options).map((holiday) => holiday.code);
const dateOf = (year: number, state: FederalState, code: HolidayCode, options = plain) =>
	holidaysFor(year, state, options)
		.find((holiday) => holiday.code === code)
		?.date.toString();

const NATIONWIDE: HolidayCode[] = [
	'new_year',
	'good_friday',
	'easter_monday',
	'labour_day',
	'ascension_day',
	'whit_monday',
	'german_unity_day',
	'christmas_day',
	'boxing_day'
];

describe('easterSunday', () => {
	it.each([
		[2024, '2024-03-31'],
		[2025, '2025-04-20'],
		[2026, '2026-04-05'],
		[2027, '2027-03-28'],
		[2028, '2028-04-16'],
		[2029, '2029-04-01'],
		[2030, '2030-04-21'],
		[1818, '1818-03-22'],
		[2038, '2038-04-25'],
		[2285, '2285-03-22']
	])('puts easter %i on %s', (year, expected) => {
		expect(easterSunday(year).toString()).toBe(expected);
	});
});

// counts and state-specific holidays as published by the states, without optional ones
const STATES: Record<FederalState, { count: number; own: HolidayCode[] }> = {
	BW: { count: 12, own: ['epiphany', 'corpus_christi', 'all_saints_day'] },
	BY: { count: 12, own: ['epiphany', 'corpus_christi', 'all_saints_day'] },
	BE: { count: 10, own: ['womens_day'] },
	BB: { count: 12, own: ['easter_sunday', 'whit_sunday', 'reformation_day'] },
	HB: { count: 10, own: ['reformation_day'] },
	HH: { count: 10, own: ['reformation_day'] },
	HE: { count: 10, own: ['corpus_christi'] },
	MV: { count: 11, own: ['womens_day', 'reformation_day'] },
	NI: { count: 10, own: ['reformation_day'] },
	NW: { count: 11, own: ['corpus_christi', 'all_saints_day'] },
	RP: { count: 11, own: ['corpus_christi', 'all_saints_day'] },
	SL: { count: 12, own: ['corpus_christi', 'assumption_day', 'all_saints_day'] },
	SN: { count: 11, own: ['reformation_day', 'repentance_day'] },
	ST: { count: 11, own: ['epiphany', 'reformation_day'] },
	SH: { count: 10, own: ['reformation_day'] },
	TH: { count: 11, own: ['world_childrens_day', 'reformation_day'] }
};

const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

describe('holidaysFor fixtures 2024 to 2030', () => {
	const cases = YEARS.flatMap((year) => FEDERAL_STATES.map((state) => [state, year] as const));

	it.each(cases)('%s %i has the published holidays', (state, year) => {
		const expected = [...NATIONWIDE, ...STATES[state].own];
		let count = STATES[state].count;
		if (state === 'BE' && year === 2025) {
			expected.push('liberation_day');
			count += 1;
		}
		const actual = codes(year, state);
		expect(actual).toHaveLength(count);
		expect([...actual].sort()).toEqual(expected.sort());
	});

	it.each([
		[2024, '2024-03-29', '2024-04-01', '2024-05-09', '2024-05-20', '2024-05-30'],
		[2025, '2025-04-18', '2025-04-21', '2025-05-29', '2025-06-09', '2025-06-19'],
		[2026, '2026-04-03', '2026-04-06', '2026-05-14', '2026-05-25', '2026-06-04'],
		[2027, '2027-03-26', '2027-03-29', '2027-05-06', '2027-05-17', '2027-05-27'],
		[2028, '2028-04-14', '2028-04-17', '2028-05-25', '2028-06-05', '2028-06-15'],
		[2029, '2029-03-30', '2029-04-02', '2029-05-10', '2029-05-21', '2029-05-31'],
		[2030, '2030-04-19', '2030-04-22', '2030-05-30', '2030-06-10', '2030-06-20']
	])('places the moving holidays of %i', (year, friday, monday, ascension, whit, corpus) => {
		expect(dateOf(year, 'BY', 'good_friday')).toBe(friday);
		expect(dateOf(year, 'BY', 'easter_monday')).toBe(monday);
		expect(dateOf(year, 'BY', 'ascension_day')).toBe(ascension);
		expect(dateOf(year, 'BY', 'whit_monday')).toBe(whit);
		expect(dateOf(year, 'BY', 'corpus_christi')).toBe(corpus);
	});

	it.each([
		[2024, '2024-11-20'],
		[2025, '2025-11-19'],
		[2026, '2026-11-18'],
		[2027, '2027-11-17'],
		[2028, '2028-11-22'],
		[2029, '2029-11-21'],
		[2030, '2030-11-20']
	])('puts the day of repentance %i in saxony on %s', (year, expected) => {
		expect(dateOf(year, 'SN', 'repentance_day')).toBe(expected);
	});

	it('lists bavaria 2026 in calendar order', () => {
		const days = holidaysFor(2026, 'BY', plain).map((holiday) => holiday.date.toString());
		expect(days).toEqual([
			'2026-01-01',
			'2026-01-06',
			'2026-04-03',
			'2026-04-06',
			'2026-05-01',
			'2026-05-14',
			'2026-05-25',
			'2026-06-04',
			'2026-10-03',
			'2026-11-01',
			'2026-12-25',
			'2026-12-26'
		]);
	});
});

describe('holidaysFor special cases', () => {
	it('keeps womens day in berlin from 2019 and in mecklenburg from 2023', () => {
		expect(codes(2018, 'BE')).not.toContain('womens_day');
		expect(dateOf(2019, 'BE', 'womens_day')).toBe('2019-03-08');
		expect(codes(2022, 'MV')).not.toContain('womens_day');
		expect(dateOf(2023, 'MV', 'womens_day')).toBe('2023-03-08');
		expect(codes(2026, 'BB')).not.toContain('womens_day');
	});

	it('keeps world childrens day in thuringia from 2019 only', () => {
		expect(codes(2018, 'TH')).not.toContain('world_childrens_day');
		expect(dateOf(2019, 'TH', 'world_childrens_day')).toBe('2019-09-20');
		expect(codes(2026, 'SN')).not.toContain('world_childrens_day');
	});

	it('makes reformation day a holiday everywhere in 2017', () => {
		for (const state of FEDERAL_STATES) {
			expect(dateOf(2017, state, 'reformation_day')).toBe('2017-10-31');
		}
	});

	it('adds reformation day in the four northern states from 2018', () => {
		for (const state of ['HB', 'HH', 'NI', 'SH'] as const) {
			expect(codes(2016, state)).not.toContain('reformation_day');
			expect(codes(2018, state)).toContain('reformation_day');
		}
		expect(codes(2016, 'SN')).toContain('reformation_day');
		expect(codes(2018, 'BW')).not.toContain('reformation_day');
	});

	it('gives berlin liberation day only in 2020 and 2025', () => {
		expect(dateOf(2020, 'BE', 'liberation_day')).toBe('2020-05-08');
		expect(dateOf(2025, 'BE', 'liberation_day')).toBe('2025-05-08');
		for (const year of [2019, 2021, 2024, 2026, 2030]) {
			expect(codes(year, 'BE')).not.toContain('liberation_day');
		}
		expect(codes(2025, 'BB')).not.toContain('liberation_day');
	});

	it('lists easter sunday and whit sunday only in brandenburg', () => {
		expect(dateOf(2026, 'BB', 'easter_sunday')).toBe('2026-04-05');
		expect(dateOf(2026, 'BB', 'whit_sunday')).toBe('2026-05-24');
		for (const state of FEDERAL_STATES.filter((state) => state !== 'BB')) {
			expect(codes(2026, state)).not.toContain('easter_sunday');
			expect(codes(2026, state)).not.toContain('whit_sunday');
		}
	});

	it('keeps the day of repentance to saxony', () => {
		for (const state of FEDERAL_STATES.filter((state) => state !== 'SN')) {
			expect(codes(2026, state)).not.toContain('repentance_day');
		}
	});

	it('keeps corpus christi in the six catholic states without any option', () => {
		for (const state of ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'] as const) {
			expect(dateOf(2026, state, 'corpus_christi')).toBe('2026-06-04');
		}
	});

	it('adds corpus christi in saxony and thuringia only when opted in', () => {
		const opted: HolidayOptions = { optional: ['corpus_christi'], halfDays: false };
		for (const state of ['SN', 'TH'] as const) {
			expect(codes(2026, state)).not.toContain('corpus_christi');
			expect(dateOf(2026, state, 'corpus_christi', opted)).toBe('2026-06-04');
		}
		expect(codes(2026, 'HB', opted)).not.toContain('corpus_christi');
	});

	it('lists corpus christi once when a catholic state opts in anyway', () => {
		const opted: HolidayOptions = { optional: ['corpus_christi'], halfDays: false };
		expect(codes(2026, 'HE', opted).filter((code) => code === 'corpus_christi')).toHaveLength(1);
	});

	it('adds assumption day in bavaria only when opted in', () => {
		expect(codes(2026, 'BY')).not.toContain('assumption_day');
		const opted: HolidayOptions = { optional: ['assumption_day'], halfDays: false };
		expect(dateOf(2026, 'BY', 'assumption_day', opted)).toBe('2026-08-15');
		expect(codes(2026, 'SL')).toContain('assumption_day');
		expect(codes(2026, 'HE', opted)).not.toContain('assumption_day');
	});

	it('adds the augsburg peace festival in bavaria only when opted in', () => {
		expect(codes(2026, 'BY')).not.toContain('augsburg_peace');
		const opted: HolidayOptions = { optional: ['augsburg_peace'], halfDays: false };
		expect(dateOf(2026, 'BY', 'augsburg_peace', opted)).toBe('2026-08-08');
		expect(codes(2026, 'BW', opted)).not.toContain('augsburg_peace');
	});

	it('adds 24 and 31 december as half days only when asked to', () => {
		expect(codes(2026, 'NI')).not.toContain('christmas_eve');
		expect(codes(2026, 'NI')).not.toContain('new_years_eve');
		const halves = holidaysFor(2026, 'NI', { optional: [], halfDays: true }).filter(
			(holiday) => holiday.portion === 0.5
		);
		expect(halves.map((holiday) => [holiday.code, holiday.date.toString()])).toEqual([
			['christmas_eve', '2026-12-24'],
			['new_years_eve', '2026-12-31']
		]);
	});
});

const optionsArb = fc.record({
	optional: fc.subarray(['corpus_christi', 'augsburg_peace', 'assumption_day'] as const),
	halfDays: fc.boolean()
});

describe('holiday properties', () => {
	test.prop([fc.integer({ min: 1583, max: 9999 })], { numRuns: 1000 })(
		'easter is always a sunday between 22 march and 25 april',
		(year) => {
			const easter = easterSunday(year);
			const earliest = Temporal.PlainDate.from({ year, month: 3, day: 22 });
			const latest = Temporal.PlainDate.from({ year, month: 4, day: 25 });
			expect(easter.dayOfWeek).toBe(7);
			expect(Temporal.PlainDate.compare(easter, earliest)).toBeGreaterThanOrEqual(0);
			expect(Temporal.PlainDate.compare(easter, latest)).toBeLessThanOrEqual(0);
		}
	);

	test.prop([fc.integer({ min: 1990, max: 2100 }), optionsArb], { numRuns: 1000 })(
		'nationwide holidays apply in all 16 states as full days on the same date',
		(year, options) => {
			const easter = easterSunday(year);
			const on = (month: number, day: number) => Temporal.PlainDate.from({ year, month, day });
			const expected: Partial<Record<HolidayCode, Temporal.PlainDate>> = {
				new_year: on(1, 1),
				good_friday: easter.subtract({ days: 2 }),
				easter_monday: easter.add({ days: 1 }),
				labour_day: on(5, 1),
				ascension_day: easter.add({ days: 39 }),
				whit_monday: easter.add({ days: 50 }),
				german_unity_day: on(10, 3),
				christmas_day: on(12, 25),
				boxing_day: on(12, 26)
			};
			for (const state of FEDERAL_STATES) {
				const holidays = holidaysFor(year, state, options);
				for (const code of NATIONWIDE) {
					expect(holidays.find((holiday) => holiday.code === code)).toEqual({
						code,
						date: expected[code],
						portion: 1
					});
				}
			}
		}
	);

	test.prop(
		[fc.integer({ min: 2020, max: 2035 }), fc.constantFrom(...FEDERAL_STATES), optionsArb],
		{ numRuns: 1000 }
	)('holidays stay in their year and come sorted by date', (year, state, options) => {
		const holidays = holidaysFor(year, state, options);
		holidays.forEach((holiday, i) => {
			expect(holiday.date.year).toBe(year);
			const previous = holidays[i - 1];
			if (previous) {
				expect(Temporal.PlainDate.compare(previous.date, holiday.date)).toBeLessThanOrEqual(0);
			}
		});
	});
});
