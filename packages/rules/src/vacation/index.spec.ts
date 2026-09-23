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
	type Bucket,
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

describe('annualEntitlement', () => {
	it('grants the full contract amount for a whole year', () => {
		expect(annualEntitlement(veteran, 2026)).toEqual({
			exact: fraction(30),
			rounded: fraction(30),
			explanations: [{ key: 'vacation.entitlement.full_year', params: { days: '30.00' } }]
		});
	});

	it('grants nothing before the entry year', () => {
		const later = employed('2027-03-01', null, contract('2027-03-01', fraction(30)));
		expect(annualEntitlement(later, 2026)).toEqual({
			exact: fraction(0),
			rounded: fraction(0),
			explanations: [{ key: 'vacation.entitlement.no_employment', params: {} }]
		});
	});

	it('grants nothing after the exit year', () => {
		const gone = employed('2020-01-01', '2025-12-31', contract('2020-01-01', fraction(30)));
		expect(annualEntitlement(gone, 2026).exact).toEqual(fraction(0));
	});

	it('grants a twelfth per month in the entry year and rounds up from exactly half a day', () => {
		const joiner = employed('2026-08-01', null, contract('2026-08-01', fraction(30)));
		expect(annualEntitlement(joiner, 2026)).toEqual({
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
		expect(annualEntitlement(joiner, 2026).exact).toEqual(fraction(25, 2));
	});

	it('grants a twelfth per month in the exit year', () => {
		const leaver = employed('2020-01-01', '2026-03-31', contract('2020-01-01', fraction(30)));
		const { exact, rounded } = annualEntitlement(leaver, 2026);
		expect(exact).toEqual(fraction(15, 2));
		expect(rounded).toEqual(fraction(8));
	});

	it('counts only the months between entry and exit within the same year', () => {
		const temp = employed('2026-03-10', '2026-05-20', contract('2026-03-10', fraction(30)));
		expect(annualEntitlement(temp, 2026).exact).toEqual(fraction(15, 2));
	});

	it('keeps a fraction below half a day instead of rounding down', () => {
		const joiner = employed('2026-10-01', null, contract('2026-10-01', fraction(25)));
		const { exact, rounded, explanations } = annualEntitlement(joiner, 2026);
		expect(exact).toEqual(fraction(25, 4));
		expect(rounded).toEqual(fraction(25, 4));
		expect(explanations).toHaveLength(1);
	});

	it('rounds up a fraction above half a day', () => {
		const joiner = employed('2026-06-01', null, contract('2026-06-01', fraction(25)));
		const { exact, rounded } = annualEntitlement(joiner, 2026);
		expect(exact).toEqual(fraction(175, 12));
		expect(rounded).toEqual(fraction(15));
	});

	it('sums each month with its own contract when the working days change', () => {
		const switcher = employed(
			'2020-01-01',
			null,
			contract('2020-01-01', fraction(20)),
			contract('2026-07-01', fraction(25))
		);
		expect(annualEntitlement(switcher, 2026)).toEqual({
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
		expect(annualEntitlement(switcher, 2026).exact).toEqual(fraction(265, 12));
	});

	it('keeps the months earned before a contract change in the entry year', () => {
		const joiner = employed(
			'2026-04-01',
			null,
			contract('2026-04-01', fraction(30)),
			contract('2026-10-01', fraction(24))
		);
		expect(annualEntitlement(joiner, 2026).exact).toEqual(fraction(21));
	});

	it('ignores a contract that only starts in the next year', () => {
		const planned = employed(
			'2020-01-01',
			null,
			contract('2020-01-01', fraction(30)),
			contract('2027-01-01', fraction(20))
		);
		expect(annualEntitlement(planned, 2026).explanations[0]?.key).toBe(
			'vacation.entitlement.full_year'
		);
	});

	it('grants the full year when leaving after 30 june with the waiting period already met', () => {
		const leaver = employed('2020-01-01', '2026-09-30', contract('2020-01-01', fraction(30)));
		expect(annualEntitlement(leaver, 2026)).toEqual({
			exact: fraction(30),
			rounded: fraction(30),
			explanations: [{ key: 'vacation.entitlement.full_on_exit', params: { days: '30.00' } }]
		});
	});

	it('still cuts the entitlement to twelfths for an exit right after 30 june without the waiting period', () => {
		const shortStint = employed('2026-06-01', '2026-10-15', contract('2026-06-01', fraction(30)));
		const { exact, explanations } = annualEntitlement(shortStint, 2026);
		expect(explanations[0]?.key).toBe('vacation.entitlement.pro_rata');
		expect(exact).toEqual(fraction(25, 2));
	});

	it('grants the full year for a first and only year once entry and exit surround 30 june', () => {
		const vestedAndGone = employed(
			'2026-01-01',
			'2026-09-30',
			contract('2026-01-01', fraction(30))
		);
		const { exact, explanations } = annualEntitlement(vestedAndGone, 2026);
		expect(explanations[0]?.key).toBe('vacation.entitlement.full_on_exit');
		expect(exact).toEqual(fraction(30));
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

	it('draws from the bucket with the earliest deadline first', () => {
		expect(allocate(fraction(7), [current, carried], day('2026-02-10'))).toEqual({
			allocations: [
				{ year: 2025, days: fraction(5) },
				{ year: 2026, days: fraction(2) }
			],
			shortfall: fraction(0)
		});
	});

	it('ignores a bucket that expired before the first day', () => {
		expect(allocate(fraction(7), [carried, current], day('2026-04-01')).allocations).toEqual([
			{ year: 2026, days: fraction(7) }
		]);
	});

	it('still draws from a bucket on its deadline day', () => {
		expect(allocate(fraction(3), [current, carried], day('2026-03-31')).allocations).toEqual([
			{ year: 2025, days: fraction(3) }
		]);
	});

	it('draws from buckets without a deadline last', () => {
		const kept: Bucket = { year: 2024, remaining: fraction(4), deadline: null };
		expect(allocate(fraction(6), [kept, carried], day('2026-02-10')).allocations).toEqual([
			{ year: 2025, days: fraction(5) },
			{ year: 2024, days: fraction(1) }
		]);
	});

	it('reports what the buckets cannot cover', () => {
		expect(allocate(fraction(40), [carried, current], day('2026-02-10'))).toEqual({
			allocations: [
				{ year: 2025, days: fraction(5) },
				{ year: 2026, days: fraction(30) }
			],
			shortfall: fraction(5)
		});
	});

	it('skips an empty bucket', () => {
		const empty = { ...carried, remaining: fraction(0) };
		expect(allocate(fraction(2), [empty, current], day('2026-02-10')).allocations).toEqual([
			{ year: 2026, days: fraction(2) }
		]);
	});

	it('splits half days across buckets', () => {
		const halfLeft = { ...carried, remaining: fraction(9, 2) };
		expect(allocate(fraction(11, 2), [halfLeft, current], day('2026-02-10')).allocations).toEqual([
			{ year: 2025, days: fraction(9, 2) },
			{ year: 2026, days: fraction(1) }
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
		'pro rata entitlement never exceeds the full year and never shrinks with more months',
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

			const wideDays = annualEntitlement(wide, 2026).exact;
			expect(compare(annualEntitlement(narrow, 2026).exact, wideDays)).toBeLessThanOrEqual(0);
			expect(compare(wideDays, full)).toBeLessThanOrEqual(0);
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
		'entitlement grows with a later exit and never exceeds the largest contract in force',
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

			const laterDays = annualEntitlement(later, 2026).exact;
			expect(compare(annualEntitlement(earlier, 2026).exact, laterDays)).toBeLessThanOrEqual(0);
			expect(compare(laterDays, largest)).toBeLessThanOrEqual(0);
		}
	);

	test.prop([tenths, fc.integer({ min: 1, max: 364 })], { numRuns: 1000 })(
		'full year entitlement matches the monthly sum over a split contract',
		(amount, splitOffset) => {
			const full = fraction(amount, 10);
			const whole = annualEntitlement(
				employed('2020-01-01', null, contract('2020-01-01', full)),
				2026
			);
			const split = annualEntitlement(
				employed(
					'2020-01-01',
					null,
					contract('2020-01-01', full),
					contract(inYear(splitOffset), full)
				),
				2026
			);
			expect(whole.explanations[0]?.key).toBe('vacation.entitlement.full_year');
			expect(split.explanations[0]?.key).toBe('vacation.entitlement.pro_rata');
			expect(split.exact).toEqual(whole.exact);
		}
	);

	test.prop([tenths, fc.integer({ min: -400, max: 364 }), fc.option(offset, { nil: null })], {
		numRuns: 1000
	})('rounding never goes down and adds at most half a day', (amount, entryOffset, exitOffset) => {
		const entry = inYear(entryOffset);
		const exit = exitOffset === null ? null : inYear(exitOffset);
		const { exact, rounded } = annualEntitlement(
			employed(entry, exit, contract(entry, fraction(amount, 10))),
			2026
		);
		const added = subtract(rounded, exact);
		expect(isNegative(added)).toBe(false);
		// exactly half a day rounds up by exactly half a day, so the bound has to be inclusive
		expect(compare(added, fraction(1, 2))).toBeLessThanOrEqual(0);
		expect(isZero(added) || isZero(fractionalPart(rounded))).toBe(true);
	});

	test.prop(
		[
			fc.integer({ min: 0, max: 120 }),
			fc.array(
				fc.record({
					remaining: fc.integer({ min: -4, max: 80 }),
					deadline: fc.option(fc.integer({ min: 0, max: 730 }), { nil: null })
				}),
				{ maxLength: 5 }
			),
			fc.integer({ min: 0, max: 730 })
		],
		{ numRuns: 1000 }
	)('allocation sums up exactly and never goes negative', (halves, drafts, firstOffset) => {
		const origin = day('2025-01-01');
		const buckets: Bucket[] = drafts.map((draft, index) => ({
			year: 2020 + index,
			remaining: fraction(draft.remaining, 2),
			deadline: draft.deadline === null ? null : origin.add({ days: draft.deadline })
		}));
		const firstDay = origin.add({ days: firstOffset });
		const requested = fraction(halves, 2);
		const plan = allocate(requested, buckets, firstDay);

		const covered = plan.allocations.reduce((sum, { days }) => add(sum, days), plan.shortfall);
		expect(covered).toEqual(requested);
		expect(isNegative(plan.shortfall)).toBe(false);
		expect(plan.allocations.every(({ days }) => compare(days, fraction(0)) > 0)).toBe(true);

		for (const bucket of buckets) {
			const drawn = plan.allocations.find(({ year }) => year === bucket.year)?.days ?? fraction(0);
			const available = max(bucket.remaining, fraction(0));
			const expired =
				bucket.deadline !== null && Temporal.PlainDate.compare(bucket.deadline, firstDay) < 0;
			expect(compare(drawn, available)).toBeLessThanOrEqual(0);
			if (expired) {
				expect(isZero(drawn)).toBe(true);
			} else if (!isZero(plan.shortfall)) {
				expect(drawn).toEqual(available);
			}
		}
	});

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
