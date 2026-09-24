import { fc, test } from '@fast-check/vitest';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import type { Employment } from '../contracts';
import {
	add,
	compare,
	fraction,
	fractionalPart,
	isNegative,
	isZero,
	max,
	multiply,
	subtract,
	type Fraction
} from '../fraction';
import type { Holiday } from '../holidays';
import {
	allocate,
	annualEntitlement,
	daysForRange,
	expiryDecision,
	sickRefund,
	type AllocationPlan,
	type Bucket,
	type DayCost,
	type Notice,
	type TakenDay,
	type VacationRange
} from './index';

type Contract = Employment['contracts'][number];
type DateInput = string | Temporal.PlainDate;

const day = (text: DateInput) => Temporal.PlainDate.from(text);
const newYear = day('2026-01-01');
const inYear = (offset: number) => newYear.add({ days: offset });

const fullTime = { mon: 480, tue: 480, wed: 480, thu: 480, fri: 480, sat: 0, sun: 0 };

const contract = (
	validFrom: DateInput,
	vacationDaysYear: Fraction,
	minutes = fullTime
): Contract => ({
	validFrom: day(validFrom),
	minutes,
	vacationDaysYear,
	vacationBasisDays: 5,
	capOverride: null
});

const employed = (entry: DateInput, exit: DateInput | null, ...contracts: Contract[]) => ({
	entryDate: day(entry),
	exitDate: exit === null ? null : day(exit),
	contracts
});

const range = (
	start: string,
	end: string,
	halves: Partial<Pick<VacationRange, 'halfDayStart' | 'halfDayEnd'>> = {}
): VacationRange => ({
	start: day(start),
	end: day(end),
	halfDayStart: false,
	halfDayEnd: false,
	...halves
});

const veteran = employed('2020-01-01', null, contract('2020-01-01', fraction(30)));
// later than every waiting period in these tests, so none of them is still running
const settled = day('2027-12-31');

describe('annualEntitlement', () => {
	it('grants the full contract amount for a whole year', () => {
		expect(annualEntitlement(veteran, 2026, settled)).toEqual({
			exact: fraction(30),
			rounded: fraction(30),
			explanations: [{ key: 'vacation.entitlement.full_year', params: { days: '30.00' } }]
		});
	});

	it('grants nothing before the entry year', () => {
		const later = employed('2027-03-01', null, contract('2027-03-01', fraction(30)));
		expect(annualEntitlement(later, 2026, settled)).toEqual({
			exact: fraction(0),
			rounded: fraction(0),
			explanations: [{ key: 'vacation.entitlement.no_employment', params: {} }]
		});
	});

	it('grants nothing after the exit year', () => {
		const gone = employed('2020-01-01', '2025-12-31', contract('2020-01-01', fraction(30)));
		expect(annualEntitlement(gone, 2026, settled).exact).toEqual(fraction(0));
	});

	it('grants a twelfth per month in the entry year and rounds up from exactly half a day', () => {
		const joiner = employed('2026-08-01', null, contract('2026-08-01', fraction(30)));
		expect(annualEntitlement(joiner, 2026, settled)).toEqual({
			exact: fraction(25, 2),
			rounded: fraction(13),
			explanations: [
				{ key: 'vacation.entitlement.pro_rata', params: { months: 5, days: '12.50' } },
				{ key: 'vacation.entitlement.rounded_up', params: { exact: '12.50', rounded: 13 } }
			]
		});
	});

	it('counts the entry month even when employment starts mid-month', () => {
		const joiner = employed('2026-08-15', null, contract('2026-08-15', fraction(30)));
		expect(annualEntitlement(joiner, 2026, settled).exact).toEqual(fraction(25, 2));
	});

	it('grants a twelfth per month in the exit year', () => {
		const leaver = employed('2020-01-01', '2026-03-31', contract('2020-01-01', fraction(30)));
		const { exact, rounded } = annualEntitlement(leaver, 2026, settled);
		expect(exact).toEqual(fraction(15, 2));
		expect(rounded).toEqual(fraction(8));
	});

	it('counts only the months between entry and exit within the same year', () => {
		const temp = employed('2026-03-10', '2026-05-20', contract('2026-03-10', fraction(30)));
		expect(annualEntitlement(temp, 2026, settled).exact).toEqual(fraction(15, 2));
	});

	it('keeps a fraction below half a day instead of rounding down', () => {
		const joiner = employed('2026-10-01', null, contract('2026-10-01', fraction(25)));
		const { exact, rounded, explanations } = annualEntitlement(joiner, 2026, settled);
		expect(exact).toEqual(fraction(25, 4));
		expect(rounded).toEqual(fraction(25, 4));
		expect(explanations).toHaveLength(1);
	});

	it('rounds up a fraction above half a day', () => {
		const joiner = employed('2026-08-01', null, contract('2026-08-01', fraction(23)));
		const { exact, rounded } = annualEntitlement(joiner, 2026, settled);
		expect(exact).toEqual(fraction(115, 12));
		expect(rounded).toEqual(fraction(10));
	});

	it('sums each month with its own contract when the working days change', () => {
		const switcher = employed(
			'2020-01-01',
			null,
			contract('2020-01-01', fraction(20)),
			contract('2026-07-01', fraction(25))
		);
		expect(annualEntitlement(switcher, 2026, settled)).toEqual({
			exact: fraction(45, 2),
			rounded: fraction(23),
			explanations: [
				{ key: 'vacation.entitlement.pro_rata', params: { months: 12, days: '22.50' } },
				{ key: 'vacation.entitlement.rounded_up', params: { exact: '22.50', rounded: 23 } }
			]
		});
	});

	it('applies a mid-month contract change from the following month on', () => {
		const switcher = employed(
			'2020-01-01',
			null,
			contract('2020-01-01', fraction(20)),
			contract('2026-07-15', fraction(25))
		);
		expect(annualEntitlement(switcher, 2026, settled).exact).toEqual(fraction(265, 12));
	});

	it('keeps the months earned before a contract change in the entry year', () => {
		const joiner = employed(
			'2026-04-01',
			null,
			contract('2026-04-01', fraction(30)),
			contract('2026-10-01', fraction(24))
		);
		expect(annualEntitlement(joiner, 2026, settled).exact).toEqual(fraction(21));
	});

	it('ignores a contract that only starts in the next year', () => {
		const planned = employed(
			'2020-01-01',
			null,
			contract('2020-01-01', fraction(30)),
			contract('2027-01-01', fraction(20))
		);
		expect(annualEntitlement(planned, 2026, settled).explanations[0]?.key).toBe(
			'vacation.entitlement.full_year'
		);
	});

	it('grants the full year when leaving after 30 june with the waiting period already met', () => {
		const leaver = employed('2020-01-01', '2026-09-30', contract('2020-01-01', fraction(30)));
		expect(annualEntitlement(leaver, 2026, settled)).toEqual({
			exact: fraction(30),
			rounded: fraction(30),
			explanations: [{ key: 'vacation.entitlement.full_on_exit', params: { days: '30.00' } }]
		});
	});

	it('still cuts the entitlement to twelfths for an exit right after 30 june without the waiting period', () => {
		const shortStint = employed('2026-06-01', '2026-10-15', contract('2026-06-01', fraction(30)));
		const { exact, explanations } = annualEntitlement(shortStint, 2026, settled);
		expect(explanations[0]?.key).toBe('vacation.entitlement.pro_rata');
		expect(exact).toEqual(fraction(25, 2));
	});

	it('grants the full year for a first and only year once entry and exit surround 30 june', () => {
		const vestedAndGone = employed(
			'2026-01-01',
			'2026-09-30',
			contract('2026-01-01', fraction(30))
		);
		const { exact, explanations } = annualEntitlement(vestedAndGone, 2026, settled);
		expect(explanations[0]?.key).toBe('vacation.entitlement.full_on_exit');
		expect(exact).toEqual(fraction(30));
	});

	it('names the last day of the waiting period while it is still running', () => {
		const joiner = employed('2026-03-15', null, contract('2026-03-15', fraction(30)));
		expect(annualEntitlement(joiner, 2026, day('2026-05-01'))).toEqual({
			exact: fraction(25),
			rounded: fraction(25),
			explanations: [
				{ key: 'vacation.entitlement.pro_rata', params: { months: 10, days: '25.00' } },
				{ key: 'vacation.entitlement.waiting_period', params: { until: '2026-09-14' } }
			]
		});
		expect(annualEntitlement(joiner, 2026, day('2026-09-14')).explanations).toHaveLength(2);
		expect(annualEntitlement(joiner, 2026, day('2026-09-15')).explanations).toHaveLength(1);
	});

	it('grants only twelfths for an exit after 30 june until the waiting period has passed', () => {
		const leaver = employed('2026-01-01', '2026-09-30', contract('2026-01-01', fraction(30)));
		expect(annualEntitlement(leaver, 2026, day('2026-03-01'))).toEqual({
			exact: fraction(45, 2),
			rounded: fraction(23),
			explanations: [
				{ key: 'vacation.entitlement.pro_rata', params: { months: 9, days: '22.50' } },
				{ key: 'vacation.entitlement.rounded_up', params: { exact: '22.50', rounded: 23 } },
				{ key: 'vacation.entitlement.waiting_period', params: { until: '2026-06-30' } }
			]
		});
		expect(annualEntitlement(leaver, 2026, day('2026-07-01'))).toEqual({
			exact: fraction(30),
			rounded: fraction(30),
			explanations: [{ key: 'vacation.entitlement.full_on_exit', params: { days: '30.00' } }]
		});
	});

	it('keeps naming a waiting period that reaches into the next year', () => {
		const joiner = employed('2026-09-01', null, contract('2026-09-01', fraction(30)));
		const asOf = day('2026-10-01');
		const waiting = { key: 'vacation.entitlement.waiting_period', params: { until: '2027-02-28' } };
		expect(annualEntitlement(joiner, 2026, asOf).explanations).toContainEqual(waiting);
		expect(annualEntitlement(joiner, 2027, asOf).explanations).toEqual([
			{ key: 'vacation.entitlement.full_year', params: { days: '30.00' } },
			waiting
		]);
	});

	it('says nothing about a waiting period the exit cuts short', () => {
		const shortStint = employed('2026-06-01', '2026-10-15', contract('2026-06-01', fraction(30)));
		const keys = annualEntitlement(shortStint, 2026, day('2026-07-01')).explanations.map(
			(explanation) => explanation.key
		);
		expect(keys).not.toContain('vacation.entitlement.waiting_period');
	});

	it('lifts the entry year to the statutory minimum once the waiting period has passed', () => {
		const joiner = employed('2026-04-01', null, contract('2026-04-01', fraction(22)));
		expect(annualEntitlement(joiner, 2026, settled)).toEqual({
			exact: fraction(20),
			rounded: fraction(20),
			explanations: [
				{ key: 'vacation.entitlement.pro_rata', params: { months: 9, days: '16.50' } },
				{ key: 'vacation.entitlement.statutory_minimum', params: { days: '20.00' } }
			]
		});
	});

	it('compares with twelfths of the minimum while the waiting period still runs', () => {
		const joiner = employed('2026-04-01', null, contract('2026-04-01', fraction(22)));
		expect(annualEntitlement(joiner, 2026, day('2026-09-30'))).toEqual({
			exact: fraction(33, 2),
			rounded: fraction(17),
			explanations: [
				{ key: 'vacation.entitlement.pro_rata', params: { months: 9, days: '16.50' } },
				{ key: 'vacation.entitlement.rounded_up', params: { exact: '16.50', rounded: 17 } },
				{ key: 'vacation.entitlement.waiting_period', params: { until: '2026-09-30' } }
			]
		});
		expect(annualEntitlement(joiner, 2026, day('2026-10-01')).exact).toEqual(fraction(20));
	});

	it('reaches the full minimum for an entry on 1 july but not on 2 july', () => {
		const first = employed('2026-07-01', null, contract('2026-07-01', fraction(22)));
		const second = employed('2026-07-02', null, contract('2026-07-02', fraction(22)));
		expect(annualEntitlement(first, 2026, settled).exact).toEqual(fraction(20));
		expect(annualEntitlement(second, 2026, settled).exact).toEqual(fraction(11));
	});

	it('converts the minimum to the working days of the week', () => {
		const threeDays = { mon: 480, tue: 480, wed: 480, thu: 0, fri: 0, sat: 0, sun: 0 };
		const staff = employed('2020-01-01', null, contract('2020-01-01', fraction(10), threeDays));
		expect(annualEntitlement(staff, 2026, settled).explanations).toEqual([
			{ key: 'vacation.entitlement.full_year', params: { days: '10.00' } },
			{ key: 'vacation.entitlement.statutory_minimum', params: { days: '12.00' } }
		]);
	});

	it('sums the minimum month by month when the working days change', () => {
		const threeDays = { mon: 480, tue: 480, wed: 480, thu: 0, fri: 0, sat: 0, sun: 0 };
		const switcher = employed(
			'2020-01-01',
			null,
			contract('2020-01-01', fraction(18)),
			contract('2026-07-01', fraction(10), threeDays)
		);
		expect(annualEntitlement(switcher, 2026, settled)).toEqual({
			exact: fraction(16),
			rounded: fraction(16),
			explanations: [
				{ key: 'vacation.entitlement.pro_rata', params: { months: 12, days: '14.00' } },
				{ key: 'vacation.entitlement.statutory_minimum', params: { days: '16.00' } }
			]
		});
	});
});

describe('daysForRange', () => {
	it('charges one day per workday and skips the weekend', () => {
		const costs = daysForRange(range('2026-09-21', '2026-09-27'), veteran, []);
		expect(costs.map((cost) => cost.date.toString())).toEqual([
			'2026-09-21',
			'2026-09-22',
			'2026-09-23',
			'2026-09-24',
			'2026-09-25',
			'2026-09-26',
			'2026-09-27'
		]);
		expect(costs.map((cost) => cost.portion)).toEqual([1, 1, 1, 1, 1, 0, 0]);
		expect(costs.map((cost) => cost.targetMinutes)).toEqual([480, 480, 480, 480, 480, 0, 0]);
		expect(costs.map((cost) => cost.explanation.key)).toEqual([
			...Array<string>(5).fill('vacation.day.workday'),
			'vacation.day.non_working_day',
			'vacation.day.non_working_day'
		]);
		expect(costs.reduce((sum, cost) => add(sum, cost.vacationDays), fraction(0))).toEqual(
			fraction(5)
		);
		expect(costs[0]?.explanation.params).toEqual({ portion: 1 });
	});

	it('does not charge a public holiday', () => {
		const labourDay: Holiday = { date: day('2026-05-01'), code: 'labour_day', portion: 1 };
		const costs = daysForRange(range('2026-04-30', '2026-05-04'), veteran, [labourDay]);
		expect(costs.map((cost) => cost.portion)).toEqual([1, 0, 0, 0, 1]);
		expect(costs[1]).toMatchObject({
			targetMinutes: 0,
			vacationDays: fraction(0),
			explanation: { key: 'vacation.day.holiday', params: { code: 'labour_day' } }
		});
	});

	it('charges only half a day on a half-day holiday like christmas eve', () => {
		const christmasEve: Holiday = { date: day('2026-12-24'), code: 'christmas_eve', portion: 0.5 };
		const [cost] = daysForRange(range('2026-12-24', '2026-12-24'), veteran, [christmasEve]);
		expect(cost).toMatchObject({
			portion: 0.5,
			targetMinutes: 240,
			vacationDays: fraction(1, 2),
			explanation: { key: 'vacation.day.half_holiday', params: { code: 'christmas_eve' } }
		});
	});

	it('does not stack a half-day flag on top of a half-day holiday', () => {
		const newYearsEve: Holiday = { date: day('2026-12-31'), code: 'new_years_eve', portion: 0.5 };
		const [cost] = daysForRange(
			range('2026-12-31', '2026-12-31', { halfDayStart: true, halfDayEnd: true }),
			veteran,
			[newYearsEve]
		);
		expect(cost?.portion).toBe(0.5);
	});

	it('charges half a day on the first and last day when requested', () => {
		const costs = daysForRange(
			range('2026-09-21', '2026-09-23', { halfDayStart: true, halfDayEnd: true }),
			veteran,
			[]
		);
		expect(costs.map((cost) => cost.portion)).toEqual([0.5, 1, 0.5]);
		expect(costs.map((cost) => cost.targetMinutes)).toEqual([240, 480, 240]);
		expect(costs.map((cost) => cost.vacationDays)).toEqual([
			fraction(1, 2),
			fraction(1),
			fraction(1, 2)
		]);
		expect(costs[0]?.explanation.params).toEqual({ portion: 0.5 });
	});

	it('charges a single half day only once when both flags are set', () => {
		const costs = daysForRange(
			range('2026-09-22', '2026-09-22', { halfDayStart: true, halfDayEnd: true }),
			veteran,
			[]
		);
		expect(costs).toHaveLength(1);
		expect(costs[0]).toMatchObject({
			portion: 0.5,
			targetMinutes: 240,
			vacationDays: fraction(1, 2)
		});
	});

	it('ignores the half-day flag when the first day is not a workday', () => {
		const costs = daysForRange(
			range('2026-09-26', '2026-09-28', { halfDayStart: true }),
			veteran,
			[]
		);
		expect(costs.map((cost) => cost.portion)).toEqual([0, 0, 1]);
	});

	it('charges a whole vacation day regardless of the planned minutes', () => {
		const partTime = { mon: 300, tue: 300, wed: 0, thu: 300, fri: 0, sat: 0, sun: 0 };
		const staff = employed('2020-01-01', null, contract('2020-01-01', fraction(18), partTime));
		const costs = daysForRange(range('2026-09-21', '2026-09-25'), staff, []);
		expect(costs.map((cost) => cost.portion)).toEqual([1, 1, 0, 1, 0]);
		expect(costs.map((cost) => cost.targetMinutes)).toEqual([300, 300, 0, 300, 0]);
		expect(costs.reduce((sum, cost) => add(sum, cost.vacationDays), fraction(0))).toEqual(
			fraction(3)
		);
	});

	it('rounds half of an odd target to whole minutes', () => {
		const odd = { ...fullTime, mon: 425 };
		const staff = employed('2020-01-01', null, contract('2020-01-01', fraction(30), odd));
		const [cost] = daysForRange(range('2026-09-21', '2026-09-21', { halfDayEnd: true }), staff, []);
		expect(cost?.targetMinutes).toBe(213);
	});

	it('does not charge days before entry or after exit', () => {
		const short = employed('2026-09-23', '2026-09-24', contract('2026-09-23', fraction(30)));
		const costs = daysForRange(range('2026-09-21', '2026-09-25'), short, []);
		expect(costs.map((cost) => cost.explanation.key)).toEqual([
			'vacation.day.outside_employment',
			'vacation.day.outside_employment',
			'vacation.day.workday',
			'vacation.day.workday',
			'vacation.day.outside_employment'
		]);
		expect(costs[0]).toMatchObject({ portion: 0, targetMinutes: 0, vacationDays: fraction(0) });
	});

	it('does not charge days before the first contract takes effect', () => {
		const pending = employed('2026-09-21', null, contract('2026-09-23', fraction(30)));
		const costs = daysForRange(range('2026-09-21', '2026-09-23'), pending, []);
		expect(costs.map((cost) => cost.portion)).toEqual([0, 0, 1]);
		expect(costs[0]?.explanation.key).toBe('vacation.day.outside_employment');
	});

	it('picks the contract by its start date, not by list order', () => {
		const halfTime = { mon: 240, tue: 240, wed: 240, thu: 240, fri: 240, sat: 0, sun: 0 };
		const staff = employed(
			'2020-01-01',
			null,
			contract('2026-09-23', fraction(15), halfTime),
			contract('2020-01-01', fraction(30))
		);
		const costs = daysForRange(range('2026-09-21', '2026-09-24'), staff, []);
		expect(costs.map((cost) => cost.targetMinutes)).toEqual([480, 480, 240, 240]);
	});
});

describe('allocate', () => {
	const carried: Bucket = { year: 2025, remaining: fraction(5), deadline: day('2026-03-31') };
	const current: Bucket = { year: 2026, remaining: fraction(30), deadline: day('2027-03-31') };
	const next: Bucket = { year: 2027, remaining: fraction(30), deadline: day('2028-03-31') };
	const taken = (...dates: string[]): TakenDay[] =>
		dates.map((date) => ({ date: day(date), vacationDays: fraction(1) }));
	const years = (plan: AllocationPlan) =>
		plan.allocations.map(({ date, year }) => [date.toString(), year]);

	it('pays each day from the earliest deadline that still holds on that day', () => {
		const goodFriday: Holiday = { date: day('2026-04-03'), code: 'good_friday', portion: 1 };
		const costs = daysForRange(range('2026-03-28', '2026-04-05'), veteran, [goodFriday]);
		expect(allocate(costs, [current, carried])).toEqual({
			allocations: [
				{ date: day('2026-03-30'), year: 2025, days: fraction(1) },
				{ date: day('2026-03-31'), year: 2025, days: fraction(1) },
				{ date: day('2026-04-01'), year: 2026, days: fraction(1) },
				{ date: day('2026-04-02'), year: 2026, days: fraction(1) }
			],
			shortfall: fraction(0)
		});
	});

	it('moves on to the new year when the old bucket ends on 31 december', () => {
		const expiring: Bucket = { year: 2026, remaining: fraction(10), deadline: day('2026-12-31') };
		const newYearsDay: Holiday = { date: day('2027-01-01'), code: 'new_year', portion: 1 };
		const costs = daysForRange(range('2026-12-28', '2027-01-05'), veteran, [newYearsDay]);
		expect(years(allocate(costs, [next, expiring]))).toEqual([
			['2026-12-28', 2026],
			['2026-12-29', 2026],
			['2026-12-30', 2026],
			['2026-12-31', 2026],
			['2027-01-04', 2027],
			['2027-01-05', 2027]
		]);
	});

	it('never pays a day from the bucket of a year that has not begun', () => {
		const lastDay = { ...current, remaining: fraction(1) };
		expect(allocate(taken('2026-12-30', '2026-12-31'), [lastDay, next])).toEqual({
			allocations: [{ date: day('2026-12-30'), year: 2026, days: fraction(1) }],
			shortfall: fraction(1)
		});
	});

	it('still pays from a bucket on its deadline day', () => {
		expect(years(allocate(taken('2026-03-31', '2026-04-01'), [current, carried]))).toEqual([
			['2026-03-31', 2025],
			['2026-04-01', 2026]
		]);
	});

	it('draws from buckets without a deadline last', () => {
		const kept: Bucket = { year: 2024, remaining: fraction(4), deadline: null };
		const oneLeft = { ...carried, remaining: fraction(1) };
		expect(years(allocate(taken('2026-02-10', '2026-02-11'), [kept, oneLeft]))).toEqual([
			['2026-02-10', 2025],
			['2026-02-11', 2024]
		]);
	});

	it('reports what the buckets cannot cover', () => {
		const twoLeft = { ...carried, remaining: fraction(2) };
		const plan = allocate(taken('2026-02-10', '2026-02-11', '2026-02-12'), [twoLeft]);
		expect(years(plan)).toEqual([
			['2026-02-10', 2025],
			['2026-02-11', 2025]
		]);
		expect(plan.shortfall).toEqual(fraction(1));
	});

	it('skips an empty bucket and days that cost nothing', () => {
		const empty = { ...carried, remaining: fraction(0) };
		const weekend = { date: day('2026-02-14'), vacationDays: fraction(0) };
		expect(allocate([...taken('2026-02-13'), weekend], [empty, current]).allocations).toEqual([
			{ date: day('2026-02-13'), year: 2026, days: fraction(1) }
		]);
	});

	it('splits a day across two buckets when only half a day is left', () => {
		const halfLeft = { ...carried, remaining: fraction(1, 2) };
		expect(allocate(taken('2026-02-10'), [halfLeft, current]).allocations).toEqual([
			{ date: day('2026-02-10'), year: 2025, days: fraction(1, 2) },
			{ date: day('2026-02-10'), year: 2026, days: fraction(1, 2) }
		]);
	});

	it('pays the earlier day first whatever order the days come in', () => {
		const oneLeft = { ...carried, remaining: fraction(1) };
		expect(years(allocate(taken('2026-02-11', '2026-02-10'), [oneLeft, current]))).toEqual([
			['2026-02-10', 2025],
			['2026-02-11', 2026]
		]);
	});
});

describe('expiryDecision', () => {
	const carried: Bucket = { year: 2025, remaining: fraction(7, 2), deadline: day('2026-03-31') };
	const notice: Notice = {
		sentAt: Temporal.Instant.from('2025-10-15T08:00:00Z'),
		deadline: day('2026-03-31')
	};

	it('is not due while the bucket has no deadline', () => {
		expect(expiryDecision({ ...carried, deadline: null }, notice, day('2027-01-01'))).toEqual({
			kind: 'not_due',
			days: fraction(7, 2),
			explanation: { key: 'vacation.expiry.not_due', params: {} }
		});
	});

	it('is not due before the deadline', () => {
		expect(expiryDecision(carried, notice, day('2026-03-30')).kind).toBe('not_due');
	});

	it('is still usable on the deadline day itself', () => {
		expect(expiryDecision(carried, notice, day('2026-03-31')).kind).toBe('not_due');
	});

	it('forfeits the rest from the day after the deadline once a notice was sent', () => {
		expect(expiryDecision(carried, notice, day('2026-04-01'))).toEqual({
			kind: 'forfeit',
			days: fraction(7, 2),
			explanation: { key: 'vacation.expiry.forfeited', params: { deadline: '2026-03-31' } }
		});
	});

	it('keeps the rest when the employer never sent a notice', () => {
		expect(expiryDecision(carried, null, day('2026-04-01'))).toEqual({
			kind: 'keep',
			days: fraction(7, 2),
			explanation: { key: 'vacation.expiry.no_notice', params: {} }
		});
	});

	it('waits for a later deadline named in the notice', () => {
		const extended = { ...notice, deadline: day('2026-06-30') };
		expect(expiryDecision(carried, extended, day('2026-04-15')).kind).toBe('not_due');
		expect(expiryDecision(carried, extended, day('2026-06-30')).kind).toBe('not_due');
		expect(expiryDecision(carried, extended, day('2026-07-01')).explanation.params).toEqual({
			deadline: '2026-06-30'
		});
	});

	it('never lets a notice pull the deadline in ahead of the bucket', () => {
		const early = { ...notice, deadline: day('2026-02-01') };
		expect(expiryDecision(carried, early, day('2026-02-15')).kind).toBe('not_due');
	});
});

describe('sickRefund', () => {
	const taken: TakenDay[] = [
		{ date: day('2026-08-05'), vacationDays: fraction(1) },
		{ date: day('2026-08-03'), vacationDays: fraction(1) },
		{ date: day('2026-08-04'), vacationDays: fraction(1, 2) }
	];

	it('refunds the vacation days that overlap with sick days', () => {
		const refund = sickRefund(taken, [day('2026-08-05'), day('2026-08-04'), day('2026-08-10')]);
		expect(refund.days).toEqual(fraction(3, 2));
		expect(refund.dates.map(String)).toEqual(['2026-08-04', '2026-08-05']);
		expect(refund.explanation).toEqual({
			key: 'vacation.sick_refund',
			params: { days: '1.50', count: 2 }
		});
	});

	it('refunds nothing without overlap', () => {
		const refund = sickRefund(taken, [day('2026-08-10')]);
		expect(refund.days).toEqual(fraction(0));
		expect(refund.dates).toEqual([]);
		expect(refund.explanation.params).toEqual({ days: '0.00', count: 0 });
	});
});

describe('vacation properties', () => {
	const tenths = fc.integer({ min: 0, max: 600 });
	const offset = fc.integer({ min: 0, max: 364 });

	test.prop([tenths, offset, offset, offset, offset, fc.boolean()], { numRuns: 1000 })(
		'pro rata entitlement stays within the full year or the minimum and grows with more months',
		(amount, start, gapIn, gapLength, gapOut, beyondYear) => {
			const full = fraction(amount, 10);
			const terms = contract('2020-01-01', full);
			const narrowEntry = Math.min(364, start + gapIn);
			const narrowExit = Math.min(364, narrowEntry + gapLength);
			const wideExit = Math.min(364, narrowExit + gapOut);
			const wide = beyondYear
				? employed('2020-01-01', null, terms)
				: employed(inYear(start), inYear(wideExit), terms);
			const narrow = employed(inYear(narrowEntry), inYear(narrowExit), terms);

			const wideDays = annualEntitlement(wide, 2026, settled).exact;
			expect(compare(annualEntitlement(narrow, 2026, settled).exact, wideDays)).toBeLessThanOrEqual(
				0
			);
			expect(compare(wideDays, max(full, fraction(20)))).toBeLessThanOrEqual(0);
		}
	);

	test.prop(
		[
			fc.array(fc.record({ shift: fc.integer({ min: 0, max: 500 }), amount: tenths }), {
				minLength: 1,
				maxLength: 4
			}),
			fc.integer({ min: -400, max: 364 }),
			offset,
			offset
		],
		{ numRuns: 1000 }
	)(
		'entitlement grows with a later exit and stays within the largest contract or the minimum',
		(drafts, entryOffset, exitA, exitB) => {
			const entry = inYear(entryOffset);
			const contracts = drafts.map(({ shift, amount }, index) =>
				contract(index === 0 ? entry : entry.add({ days: shift }), fraction(amount, 10))
			);
			const earlier = employed(entry, inYear(Math.min(exitA, exitB)), ...contracts);
			const later = employed(entry, inYear(Math.max(exitA, exitB)), ...contracts);
			const largest = contracts
				.filter((signed) => signed.validFrom.year <= 2026)
				.reduce((top, signed) => max(top, signed.vacationDaysYear), fraction(0));

			const laterDays = annualEntitlement(later, 2026, settled).exact;
			expect(
				compare(annualEntitlement(earlier, 2026, settled).exact, laterDays)
			).toBeLessThanOrEqual(0);
			expect(compare(laterDays, max(largest, fraction(20)))).toBeLessThanOrEqual(0);
		}
	);

	test.prop([tenths, fc.integer({ min: 1, max: 364 })], { numRuns: 1000 })(
		'full year entitlement matches the monthly sum over a split contract',
		(amount, splitOffset) => {
			const full = fraction(amount, 10);
			const whole = annualEntitlement(
				employed('2020-01-01', null, contract('2020-01-01', full)),
				2026,
				settled
			);
			const split = annualEntitlement(
				employed(
					'2020-01-01',
					null,
					contract('2020-01-01', full),
					contract(inYear(splitOffset), full)
				),
				2026,
				settled
			);
			expect(whole.explanations[0]?.key).toBe('vacation.entitlement.full_year');
			expect(split.explanations[0]?.key).toBe('vacation.entitlement.pro_rata');
			expect(split.exact).toEqual(whole.exact);
		}
	);

	const entitlementFrom = (amount: number, entryOffset: number, exitOffset: number | null) => {
		const entry = inYear(entryOffset);
		const exit = exitOffset === null ? null : inYear(exitOffset);
		return annualEntitlement(
			employed(entry, exit, contract(entry, fraction(amount, 10))),
			2026,
			settled
		);
	};

	test.prop([tenths, fc.integer({ min: -400, max: 364 }), fc.option(offset, { nil: null })], {
		numRuns: 1000
	})('rounding never goes down and adds at most half a day', (amount, entryOffset, exitOffset) => {
		const { exact, rounded } = entitlementFrom(amount, entryOffset, exitOffset);
		const added = subtract(rounded, exact);
		expect(isNegative(added)).toBe(false);
		// exactly half a day rounds up by exactly half a day, so the bound has to be inclusive
		expect(compare(added, fraction(1, 2))).toBeLessThanOrEqual(0);
		expect(isZero(added) || isZero(fractionalPart(rounded))).toBe(true);
	});

	// the bounds above would also pass if nothing were ever rounded
	test.prop([tenths, fc.integer({ min: -400, max: 364 }), fc.option(offset, { nil: null })], {
		numRuns: 1000
	})(
		'the rounded entitlement never keeps half a day or more as a fraction',
		(amount, entryOffset, exitOffset) => {
			const { rounded } = entitlementFrom(amount, entryOffset, exitOffset);
			expect(compare(fractionalPart(rounded), fraction(1, 2))).toBeLessThan(0);
		}
	);

	const workingWeek = fc.record({
		mon: fc.integer({ min: 0, max: 600 }),
		tue: fc.integer({ min: 0, max: 600 }),
		wed: fc.integer({ min: 0, max: 600 }),
		thu: fc.integer({ min: 0, max: 600 }),
		fri: fc.integer({ min: 0, max: 600 }),
		sat: fc.integer({ min: 0, max: 600 }),
		sun: fc.integer({ min: 0, max: 600 })
	});

	test.prop(
		[
			tenths,
			workingWeek,
			fc.integer({ min: -400, max: 364 }),
			fc.option(fc.integer({ min: 0, max: 500 }), { nil: null }),
			fc.integer({ min: -200, max: 900 })
		],
		{ numRuns: 1000 }
	)(
		'the entitlement never falls below the statutory share of the months employed',
		(amount, week, entryOffset, stay, asOfOffset) => {
			const entry = inYear(entryOffset);
			const exit = stay === null ? null : entry.add({ days: stay });
			const staff = employed(entry, exit, contract(entry, fraction(amount, 10), week));
			const asOf = inYear(asOfOffset);
			const { exact } = annualEntitlement(staff, 2026, asOf);

			const workdays = Object.values(week).filter((minutes) => minutes > 0).length;
			const minimum = fraction(24 * workdays, 6);
			const from = entry.year < 2026 ? 1 : entry.year === 2026 ? entry.month : 13;
			const to = exit === null || exit.year > 2026 ? 12 : exit.year === 2026 ? exit.month : 0;
			const months = Math.max(0, to - from + 1);
			expect(compare(exact, multiply(minimum, fraction(months, 12)))).toBeGreaterThanOrEqual(0);

			const lastWaitingDay = entry.add({ months: 6 }).subtract({ days: 1 });
			const waitedThisYear =
				lastWaitingDay.year === 2026 && Temporal.PlainDate.compare(asOf, lastWaitingDay) > 0;
			if (exit === null && (entry.year < 2026 || waitedThisYear)) {
				expect(compare(exact, minimum)).toBeGreaterThanOrEqual(0);
			}
		}
	);

	test.prop(
		[
			tenths,
			fc.integer({ min: -400, max: 364 }),
			fc.option(fc.integer({ min: 0, max: 500 }), { nil: null }),
			fc.integer({ min: -200, max: 900 }),
			fc.integer({ min: 0, max: 400 })
		],
		{ numRuns: 1000 }
	)(
		'a later reference date never shrinks the entitlement and ends the waiting period note',
		(amount, entryOffset, stay, asOfOffset, wait) => {
			const entry = inYear(entryOffset);
			const exit = stay === null ? null : entry.add({ days: stay });
			const staff = employed(entry, exit, contract(entry, fraction(amount, 10)));
			const asOf = inYear(asOfOffset);
			const early = annualEntitlement(staff, 2026, asOf);
			const late = annualEntitlement(staff, 2026, asOf.add({ days: wait }));
			expect(compare(early.exact, late.exact)).toBeLessThanOrEqual(0);

			const named = early.explanations.some(
				(explanation) => explanation.key === 'vacation.entitlement.waiting_period'
			);
			if (Temporal.PlainDate.compare(asOf, entry.add({ months: 6 })) >= 0) {
				expect(named).toBe(false);
			}
		}
	);

	const origin = day('2025-01-01');
	const bucketDrafts = fc.uniqueArray(
		fc.record({
			year: fc.integer({ min: 2023, max: 2027 }),
			remaining: fc.integer({ min: -4, max: 80 }),
			deadline: fc.option(fc.integer({ min: 0, max: 820 }), { nil: null })
		}),
		{ selector: (draft) => draft.year, maxLength: 5 }
	);
	const toBuckets = (
		drafts: { year: number; remaining: number; deadline: number | null }[]
	): Bucket[] =>
		drafts.map(({ year, remaining, deadline }) => ({
			year,
			remaining: fraction(remaining, 2),
			deadline:
				deadline === null
					? null
					: Temporal.PlainDate.from({ year, month: 1, day: 1 }).add({ days: deadline })
		}));
	const dayDrafts = fc.uniqueArray(
		fc.record({ offset: fc.integer({ min: 0, max: 1095 }), halves: fc.constantFrom(0, 1, 2) }),
		{ selector: (draft) => draft.offset, maxLength: 30 }
	);
	const toDays = (drafts: { offset: number; halves: number }[]): TakenDay[] =>
		drafts.map(({ offset, halves }) => ({
			date: origin.add({ days: offset }),
			vacationDays: fraction(halves, 2)
		}));
	const available = (bucket: Bucket) => max(bucket.remaining, fraction(0));
	const holdsOn = (bucket: Bucket, date: Temporal.PlainDate) =>
		date.year >= bucket.year &&
		(bucket.deadline === null || Temporal.PlainDate.compare(date, bucket.deadline) <= 0);
	const sum = (fractions: Fraction[]) => fractions.reduce(add, fraction(0));

	test.prop([dayDrafts, bucketDrafts], { numRuns: 1000 })(
		'allocation sums up exactly, overdraws no bucket and pays no day outside its bucket',
		(drafts, bucketPlans) => {
			const days = toDays(drafts);
			const buckets = toBuckets(bucketPlans);
			const plan = allocate(days, buckets);

			expect(sum([...plan.allocations.map((share) => share.days), plan.shortfall])).toEqual(
				sum(days.map((taken) => taken.vacationDays))
			);
			expect(isNegative(plan.shortfall)).toBe(false);
			for (const share of plan.allocations) {
				const bucket = buckets.find(({ year }) => year === share.year);
				expect(compare(share.days, fraction(0))).toBeGreaterThan(0);
				expect(bucket && holdsOn(bucket, share.date)).toBe(true);
			}
			for (const bucket of buckets) {
				const drawn = plan.allocations.filter(({ year }) => year === bucket.year);
				expect(
					compare(sum(drawn.map((share) => share.days)), available(bucket))
				).toBeLessThanOrEqual(0);
			}
			for (const taken of days) {
				const paid = plan.allocations.filter(({ date }) => date.equals(taken.date));
				expect(
					compare(sum(paid.map((share) => share.days)), taken.vacationDays)
				).toBeLessThanOrEqual(0);
			}
		}
	);

	// a bucket without a deadline counts as the one that expires last
	const expiresBefore = (a: Bucket, b: Bucket) =>
		a.deadline !== null &&
		(b.deadline === null || Temporal.PlainDate.compare(a.deadline, b.deadline) < 0);

	test.prop([dayDrafts, bucketDrafts], { numRuns: 1000 })(
		'a day only reaches a later deadline once every earlier bucket valid that day is used up',
		(drafts, bucketPlans) => {
			const buckets = toBuckets(bucketPlans);
			const plan = allocate(toDays(drafts), buckets);
			const drawnThrough = (bucket: Bucket, date: Temporal.PlainDate) =>
				sum(
					plan.allocations
						.filter((share) => share.year === bucket.year)
						.filter((share) => Temporal.PlainDate.compare(share.date, date) <= 0)
						.map((share) => share.days)
				);

			for (const share of plan.allocations) {
				const paying = buckets.find(({ year }) => year === share.year)!;
				const earlier = buckets.filter(
					(bucket) => holdsOn(bucket, share.date) && expiresBefore(bucket, paying)
				);
				for (const bucket of earlier) {
					expect(drawnThrough(bucket, share.date)).toEqual(available(bucket));
				}
			}
		}
	);

	test.prop([dayDrafts, bucketDrafts], { numRuns: 1000 })(
		'the order of the days does not change the plan',
		(drafts, bucketPlans) => {
			const days = toDays(drafts);
			const buckets = toBuckets(bucketPlans);
			expect(allocate(days.toReversed(), buckets)).toEqual(allocate(days, buckets));
		}
	);

	const march31 = day('2026-03-31');
	const later = (a: Temporal.PlainDate, b: Temporal.PlainDate) =>
		Temporal.PlainDate.compare(a, b) >= 0 ? a : b;
	const expiryCase = fc
		.record({
			halves: fc.integer({ min: 0, max: 80 }),
			bucketShift: fc.option(fc.integer({ min: -60, max: 60 }), { nil: null }),
			noticeShift: fc.option(fc.integer({ min: -90, max: 90 }), { nil: null }),
			daysPast: fc.integer({ min: -30, max: 30 })
		})
		.map(({ halves, bucketShift, noticeShift, daysPast }) => {
			const bucket: Bucket = {
				year: 2025,
				remaining: fraction(halves, 2),
				deadline: bucketShift === null ? null : march31.add({ days: bucketShift })
			};
			const notice: Notice | null =
				noticeShift === null
					? null
					: {
							sentAt: Temporal.Instant.from('2025-10-15T08:00:00Z'),
							deadline: march31.add({ days: noticeShift })
						};
			// today is placed relative to the last usable day, so the day itself comes up often
			const lastDay =
				bucket.deadline && notice
					? later(bucket.deadline, notice.deadline)
					: (bucket.deadline ?? march31);
			return { bucket, notice, daysPast, today: lastDay.add({ days: daysPast }) };
		});

	test.prop([expiryCase], { numRuns: 1000 })(
		'the expiry decision always carries the remaining days unchanged',
		({ bucket, notice, today }) => {
			expect(expiryDecision(bucket, notice, today).days).toEqual(bucket.remaining);
		}
	);

	test.prop([expiryCase], { numRuns: 1000 })(
		'days only expire after the later of both deadlines and only with a notice',
		({ bucket, notice, today, daysPast }) => {
			const due = bucket.deadline !== null && daysPast > 0;
			const expected = !due ? 'not_due' : notice ? 'forfeit' : 'keep';
			expect(expiryDecision(bucket, notice, today).kind).toBe(expected);
		}
	);

	const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
	const weekdayMinutes = fc.integer({ min: 0, max: 600 });
	const rangeCase = fc
		.record({
			weekly: fc.record({
				mon: weekdayMinutes,
				tue: weekdayMinutes,
				wed: weekdayMinutes,
				thu: weekdayMinutes,
				fri: weekdayMinutes,
				sat: weekdayMinutes,
				sun: weekdayMinutes
			}),
			contractShift: fc.integer({ min: -30, max: 60 }),
			entryShift: fc.integer({ min: -30, max: 60 }),
			stay: fc.option(fc.integer({ min: 0, max: 90 }), { nil: null }),
			startShift: fc.integer({ min: 0, max: 40 }),
			length: fc.integer({ min: 0, max: 20 }),
			halfDayStart: fc.boolean(),
			halfDayEnd: fc.boolean(),
			holidays: fc.array(
				fc.record({ offset: fc.integer({ min: 0, max: 20 }), half: fc.boolean() }),
				{
					maxLength: 6
				}
			)
		})
		.map((drafted) => {
			const entry = inYear(drafted.entryShift);
			const start = inYear(drafted.startShift);
			const exit = drafted.stay === null ? null : entry.add({ days: drafted.stay });
			return {
				weekly: drafted.weekly,
				range: {
					start,
					end: start.add({ days: drafted.length }),
					halfDayStart: drafted.halfDayStart,
					halfDayEnd: drafted.halfDayEnd
				},
				staff: employed(
					entry,
					exit,
					contract(inYear(drafted.contractShift), fraction(30), drafted.weekly)
				),
				holidays: drafted.holidays.map(({ offset, half }): Holiday => ({
					date: start.add({ days: offset }),
					code: half ? 'christmas_eve' : 'labour_day',
					portion: half ? 0.5 : 1
				}))
			};
		});

	const share: Record<DayCost['portion'], Fraction> = {
		0: fraction(0),
		0.5: fraction(1, 2),
		1: fraction(1)
	};

	test.prop([rangeCase], { numRuns: 1000 })(
		'each day costs nothing, half a day or a whole day of vacation',
		({ range, staff, holidays }) => {
			for (const cost of daysForRange(range, staff, holidays)) {
				expect([0, 0.5, 1]).toContain(cost.portion);
				expect(cost.vacationDays).toEqual(share[cost.portion]);
			}
		}
	);

	test.prop([rangeCase], { numRuns: 1000 })(
		'the target minutes of a day are its portion of the contract minutes',
		({ weekly, range, staff, holidays }) => {
			for (const cost of daysForRange(range, staff, holidays)) {
				const minutes = weekly[WEEKDAYS[cost.date.dayOfWeek - 1]!];
				const expected = { 0: 0, 0.5: Math.round(minutes / 2), 1: minutes }[cost.portion];
				expect(cost.targetMinutes).toBe(expected);
			}
		}
	);

	test.prop(
		[
			fc.uniqueArray(fc.record({ offset: fc.integer({ min: 0, max: 60 }), half: fc.boolean() }), {
				selector: (entry) => entry.offset,
				maxLength: 20
			}),
			fc.array(fc.integer({ min: 0, max: 60 }), { maxLength: 20 })
		],
		{ numRuns: 1000 }
	)(
		'refund never exceeds the vacation days taken on the overlapping dates',
		(takenDrafts, sickOffsets) => {
			const origin = day('2026-07-01');
			const taken: TakenDay[] = takenDrafts.map(({ offset, half }) => ({
				date: origin.add({ days: offset }),
				vacationDays: half ? fraction(1, 2) : fraction(1)
			}));
			const sickDates = sickOffsets.map((offset) => origin.add({ days: offset }));
			const refund = sickRefund(taken, sickDates);

			const overlapping = taken.filter(({ date }) => sickDates.some((sick) => sick.equals(date)));
			const overlap = overlapping.reduce((sum, entry) => add(sum, entry.vacationDays), fraction(0));
			const everything = taken.reduce((sum, entry) => add(sum, entry.vacationDays), fraction(0));
			expect(compare(refund.days, overlap)).toBe(0);
			expect(compare(refund.days, everything)).toBeLessThanOrEqual(0);
			expect(refund.dates).toHaveLength(overlapping.length);
			const listed = refund.dates.map(String);
			expect(listed).toEqual(listed.toSorted());
		}
	);
});
