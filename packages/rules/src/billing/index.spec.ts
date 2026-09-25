import { fc, test } from '@fast-check/vitest';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { fraction } from '../fraction';
import { percentOf } from '../money';
import {
	aggregate,
	budgetStatus,
	invoiceForm,
	invoiceTotals,
	isBillable,
	isSmallAmountInvoice,
	linesFromCells,
	negateLines,
	resolveRate,
	roundingFor,
	roundMinutes,
	smallBusinessCheck,
	taxTreatment,
	vatRateFor,
	type Cell,
	type Line,
	type ProjectEntry,
	type Rate,
	type RateLevel,
	type RoundingMode,
	type RoundingOverride,
	type RoundingRule
} from './index';

const BERLIN = 'Europe/Berlin';
const date = (iso: string) => Temporal.PlainDate.from(iso);
const local = (text: string) => Temporal.ZonedDateTime.from(`${text}[${BERLIN}]`).toInstant();

describe('roundMinutes', () => {
	it('rounds a cell up to the next increment', () => {
		expect(roundMinutes(47, { increment: 15, mode: 'up' })).toEqual({
			minutes: 60,
			explanation: { key: 'billing.rounding.up', params: { raw: 47, increment: 15, rounded: 60 } }
		});
	});

	it('leaves an exact multiple alone in every mode', () => {
		expect(roundMinutes(45, { increment: 15, mode: 'up' }).minutes).toBe(45);
		expect(roundMinutes(45, { increment: 15, mode: 'nearest' }).minutes).toBe(45);
		expect(roundMinutes(45, { increment: 15, mode: 'down' }).minutes).toBe(45);
	});

	it('rounds down to the last increment', () => {
		expect(roundMinutes(59, { increment: 15, mode: 'down' })).toEqual({
			minutes: 45,
			explanation: {
				key: 'billing.rounding.down',
				params: { raw: 59, increment: 15, rounded: 45 }
			}
		});
	});

	it('rounds to the nearest increment, half goes up', () => {
		expect(roundMinutes(22, { increment: 15, mode: 'nearest' }).minutes).toBe(15);
		expect(roundMinutes(23, { increment: 15, mode: 'nearest' }).minutes).toBe(30);
		expect(roundMinutes(25, { increment: 10, mode: 'nearest' }).minutes).toBe(30);
		expect(roundMinutes(7, { increment: 15, mode: 'nearest' }).minutes).toBe(0);
	});

	it('keeps an empty cell at zero even when rounding up', () => {
		expect(roundMinutes(0, { increment: 15, mode: 'up' }).minutes).toBe(0);
	});

	it('changes nothing with an increment of one minute', () => {
		expect(roundMinutes(47, { increment: 1, mode: 'up' }).minutes).toBe(47);
	});
});

describe('roundingFor', () => {
	const profile: RoundingRule = { incrementMinutes: 15, mode: 'up' };
	const inherits = { incrementMinutes: null, mode: null };

	it('falls back to the tenant profile', () => {
		expect(roundingFor(profile, inherits, inherits)).toEqual({
			rule: { incrementMinutes: 15, mode: 'up' },
			explanation: {
				key: 'billing.rounding.rule',
				params: {
					incrementMinutes: 15,
					incrementFrom: 'profile',
					mode: 'up',
					modeFrom: 'profile'
				}
			}
		});
	});

	it('lets the client override the profile', () => {
		const { rule, explanation } = roundingFor(
			profile,
			{ incrementMinutes: 6, mode: 'nearest' },
			inherits
		);
		expect(rule).toEqual({ incrementMinutes: 6, mode: 'nearest' });
		expect(explanation.params).toMatchObject({ incrementFrom: 'client', modeFrom: 'client' });
	});

	it('lets the project override the client', () => {
		const { rule } = roundingFor(
			profile,
			{ incrementMinutes: 6, mode: 'nearest' },
			{ incrementMinutes: 30, mode: 'down' }
		);
		expect(rule).toEqual({ incrementMinutes: 30, mode: 'down' });
	});

	it('takes increment and mode from different levels', () => {
		const { rule, explanation } = roundingFor(
			profile,
			{ incrementMinutes: null, mode: 'down' },
			{ incrementMinutes: 10, mode: null }
		);
		expect(rule).toEqual({ incrementMinutes: 10, mode: 'down' });
		expect(explanation.params).toMatchObject({ incrementFrom: 'project', modeFrom: 'client' });
	});
});

const rate = (id: string, cents: bigint, dims: Partial<Rate> = {}): Rate => ({
	id,
	clientId: null,
	projectId: null,
	taskId: null,
	employeeId: null,
	validFrom: date('2026-01-01'),
	cents,
	...dims
});

describe('resolveRate', () => {
	const query = {
		clientId: 'c1',
		projectId: 'p1',
		taskId: 't1',
		employeeId: 'e1',
		date: date('2026-05-12')
	};
	const client = { clientId: 'c1' };
	const project = { ...client, projectId: 'p1' };
	const task = { ...project, taskId: 't1' };
	const person = { employeeId: 'e1' };
	const levels: Rate[] = [
		rate('task_employee', 15000n, { ...task, ...person }),
		rate('task', 14000n, task),
		rate('project_employee', 13000n, { ...project, ...person }),
		rate('project', 12000n, project),
		rate('client_employee', 11000n, { ...client, ...person }),
		rate('client', 10000n, client),
		rate('employee', 9000n, person),
		rate('default', 8000n)
	];

	it('walks down the levels from task and person to the default rate', () => {
		for (let i = 0; i < levels.length; i++) {
			const found = resolveRate(levels.slice(i), query);
			expect(found?.rateId).toBe(levels[i]?.id);
			expect(found?.level).toBe(levels[i]?.id);
		}
	});

	it('explains which rate applies and since when', () => {
		expect(resolveRate(levels, query)).toEqual({
			cents: 15000n,
			level: 'task_employee',
			rateId: 'task_employee',
			explanation: {
				key: 'billing.rate.task_employee',
				params: { cents: '15000', validFrom: '2026-01-01' }
			}
		});
	});

	it('lets the client rate bind before the personal rate', () => {
		expect(resolveRate(levels.slice(5), query)?.level).toBe('client');
	});

	it('takes the newest rate of a level that has started by the day of service', () => {
		const rates = [
			rate('old', 9000n, project),
			rate('current', 9500n, { ...project, validFrom: date('2026-04-01') }),
			rate('future', 9900n, { ...project, validFrom: date('2026-06-01') })
		];
		expect(resolveRate(rates, query)?.rateId).toBe('current');
		expect(resolveRate(rates, { ...query, date: date('2026-03-31') })?.rateId).toBe('old');
		expect(resolveRate(rates, { ...query, date: date('2026-06-01') })?.rateId).toBe('future');
	});

	it('keeps an older rate of a more specific level over a newer general one', () => {
		const rates = [
			rate('project', 12000n, project),
			rate('client', 10000n, { ...client, validFrom: date('2026-05-01') })
		];
		expect(resolveRate(rates, query)?.rateId).toBe('project');
	});

	it('ignores rates for other people, tasks, projects and clients', () => {
		const rates = [
			rate('colleague', 20000n, { ...task, employeeId: 'e2' }),
			rate('other task', 20000n, { ...project, taskId: 't2' }),
			rate('other project', 20000n, { ...client, projectId: 'p2' }),
			rate('other client', 20000n, { clientId: 'c2' })
		];
		expect(resolveRate(rates, query)).toBeNull();
		expect(resolveRate([...rates, rate('default', 8000n)], query)?.rateId).toBe('default');
	});

	it('does not apply a task rate to time booked on the project without a task', () => {
		const rates = [rate('task', 14000n, task), rate('project', 12000n, project)];
		expect(resolveRate(rates, { ...query, taskId: null })?.rateId).toBe('project');
	});

	it('returns null when no rate has started yet', () => {
		expect(
			resolveRate([rate('default', 8000n)], { ...query, date: date('2025-12-31') })
		).toBeNull();
	});

	it('accepts a rate of zero', () => {
		expect(resolveRate([rate('free', 0n, project)], query)?.cents).toBe(0n);
	});
});

describe('isBillable', () => {
	it('lets the entry decide first', () => {
		expect(isBillable({ billable: false }, { billable: true }, { billable: true })).toBe(false);
		expect(isBillable({ billable: true }, { billable: false }, { billable: false })).toBe(true);
	});

	it('falls back to the task, then the project', () => {
		expect(isBillable({ billable: null }, { billable: false }, { billable: true })).toBe(false);
		expect(isBillable({ billable: null }, { billable: null }, { billable: false })).toBe(false);
		expect(isBillable({ billable: null }, null, { billable: true })).toBe(true);
	});
});

const entry = (id: string, start: string, end: string, extra: Partial<ProjectEntry> = {}) => ({
	id,
	employeeId: 'e1',
	clientId: 'c1',
	projectId: 'p1',
	taskId: null,
	start: local(start),
	end: local(end),
	workday: date(start.slice(0, 10)),
	billable: true,
	...extra
});

describe('aggregate', () => {
	const quarterUp = () => ({ incrementMinutes: 15, mode: 'up' as const });
	const rates = [rate('default', 9500n)];

	it('rounds the sum of a cell, not every single entry', () => {
		// ten one-minute entries would be 150 minutes if each were rounded up (T-06)
		const entries = Array.from({ length: 10 }, (_, i) =>
			entry(
				`e${i}`,
				`2026-05-12T09:${String(i * 2).padStart(2, '0')}`,
				`2026-05-12T09:${String(i * 2 + 1).padStart(2, '0')}`
			)
		);
		const [cell, ...rest] = aggregate(entries, { rates, rounding: quarterUp });
		expect(rest).toEqual([]);
		expect(cell).toMatchObject({ rawMinutes: 10, roundedMinutes: 15 });
		expect(cell?.entryIds).toHaveLength(10);
	});

	it('adds the exact durations before rounding to whole minutes', () => {
		const entries = [
			entry('a', '2026-05-12T09:00:00', '2026-05-12T09:10:30'),
			entry('b', '2026-05-12T10:00:00', '2026-05-12T10:10:30')
		];
		expect(aggregate(entries, { rates, rounding: quarterUp })[0]?.rawMinutes).toBe(21);
	});

	it('builds one cell per day, task, person and billable flag', () => {
		const entries = [
			entry('mon', '2026-05-11T09:00', '2026-05-11T10:00'),
			entry('tue', '2026-05-12T09:00', '2026-05-12T10:00'),
			entry('task', '2026-05-12T10:00', '2026-05-12T11:00', { taskId: 't1' }),
			entry('free', '2026-05-12T11:00', '2026-05-12T12:00', { billable: false }),
			entry('colleague', '2026-05-12T09:00', '2026-05-12T10:00', { employeeId: 'e2' }),
			entry('tue again', '2026-05-12T13:00', '2026-05-12T13:20')
		];
		const cells = aggregate(entries, { rates, rounding: quarterUp });
		expect(cells.map((cell) => cell.entryIds)).toEqual([
			['mon'],
			['tue', 'tue again'],
			['colleague'],
			['task'],
			['free']
		]);
		expect(cells[1]).toMatchObject({ rawMinutes: 80, roundedMinutes: 90 });
	});

	it('keeps a night entry on the day it started', () => {
		const [cell] = aggregate([entry('night', '2026-05-12T23:00', '2026-05-13T01:00')], {
			rates,
			rounding: quarterUp
		});
		expect(cell?.date.toString()).toBe('2026-05-12');
		expect(cell?.rawMinutes).toBe(120);
	});

	it('uses the rounding rule of each project', () => {
		const entries = [
			entry('a', '2026-05-12T09:00', '2026-05-12T09:07'),
			entry('b', '2026-05-12T10:00', '2026-05-12T10:07', { projectId: 'p2' })
		];
		const rounding = (projectId: string): RoundingRule =>
			projectId === 'p2' ? { incrementMinutes: 6, mode: 'down' } : quarterUp();
		const cells = aggregate(entries, { rates, rounding });
		expect(cells.map((cell) => cell.roundedMinutes)).toEqual([15, 6]);
		expect(cells[1]?.rounding).toEqual({
			key: 'billing.rounding.down',
			params: { raw: 7, increment: 6, rounded: 6 }
		});
	});

	it('resolves the rate for the day, person and task of the cell', () => {
		const withRaise = [
			...rates,
			rate('senior', 12000n, { clientId: 'c1', projectId: 'p1', employeeId: 'e2' }),
			rate('raise', 10000n, { validFrom: date('2026-05-12') })
		];
		const cells = aggregate(
			[
				entry('before', '2026-05-11T09:00', '2026-05-11T10:00'),
				entry('after', '2026-05-12T09:00', '2026-05-12T10:00'),
				entry('senior', '2026-05-12T09:00', '2026-05-12T10:00', { employeeId: 'e2' })
			],
			{ rates: withRaise, rounding: quarterUp }
		);
		expect(cells.map((cell) => cell.rate?.rateId)).toEqual(['default', 'raise', 'senior']);
	});

	it('leaves the rate empty when none applies', () => {
		const [cell] = aggregate([entry('a', '2026-05-12T09:00', '2026-05-12T10:00')], {
			rates: [],
			rounding: quarterUp
		});
		expect(cell?.rate).toBeNull();
	});

	it('returns nothing for no entries', () => {
		expect(aggregate([], { rates, rounding: quarterUp })).toEqual([]);
	});
});

const cell = (day: string, roundedMinutes: number, extra: Partial<Cell> = {}): Cell => ({
	employeeId: 'e1',
	clientId: 'c1',
	projectId: 'p1',
	taskId: null,
	date: date(day),
	billable: true,
	entryIds: [`entry-${day}`],
	rawMinutes: roundedMinutes,
	roundedMinutes,
	rounding: { key: 'billing.rounding.up', params: {} },
	rate: { cents: 9500n, level: 'default', rateId: 'r1', explanation: { key: 'x', params: {} } },
	...extra
});

describe('linesFromCells', () => {
	it('sums the rounded minutes of a project into one line and prices them once', () => {
		const lines = linesFromCells(
			[cell('2026-05-12', 60), cell('2026-05-11', 45), cell('2026-05-13', 15)],
			'standard'
		);
		expect(lines).toEqual([
			{
				projectId: 'p1',
				taskId: null,
				serviceFrom: date('2026-05-11'),
				serviceTo: date('2026-05-13'),
				minutes: 120,
				rateCents: 9500n,
				taxCategory: 'standard',
				taxRateBp: 1900,
				entryIds: ['entry-2026-05-11', 'entry-2026-05-12', 'entry-2026-05-13'],
				netCents: 19000n
			}
		]);
	});

	it('rounds the price of the line half away from zero', () => {
		// 7 minutes at 95.00 are 1108.33 cents, 1 minute at 0.90 is exactly 1.5 cents
		expect(linesFromCells([cell('2026-05-12', 7)], 'standard')[0]?.netCents).toBe(1108n);
		const cheap = cell('2026-05-12', 1, {
			rate: { cents: 90n, level: 'default', rateId: 'r2', explanation: { key: 'x', params: {} } }
		});
		expect(linesFromCells([cheap], 'standard')[0]?.netCents).toBe(2n);
	});

	it('splits a line where the rate changes within the period', () => {
		const raised = {
			cents: 10000n,
			level: 'default' as const,
			rateId: 'r2',
			explanation: { key: 'x', params: {} }
		};
		const lines = linesFromCells(
			[
				cell('2026-05-11', 60),
				cell('2026-05-12', 60),
				cell('2026-05-13', 30, { rate: raised }),
				cell('2026-05-14', 30, { rate: raised })
			],
			'standard'
		);
		expect(
			lines.map((line) => [line.serviceFrom.toString(), line.serviceTo.toString(), line.netCents])
		).toEqual([
			['2026-05-11', '2026-05-12', 19000n],
			['2026-05-13', '2026-05-14', 10000n]
		]);
	});

	it('keeps tasks and projects on lines of their own', () => {
		const lines = linesFromCells(
			[
				cell('2026-05-11', 60),
				cell('2026-05-11', 60, { taskId: 't1' }),
				cell('2026-05-11', 60, { projectId: 'p2' })
			],
			'standard'
		);
		expect(lines.map((line) => [line.projectId, line.taskId])).toEqual([
			['p1', null],
			['p1', 't1'],
			['p2', null]
		]);
	});

	it('puts two people with the same rate on one line', () => {
		const lines = linesFromCells(
			[cell('2026-05-11', 60), cell('2026-05-11', 30, { employeeId: 'e2' })],
			'standard'
		);
		expect(lines.map((line) => line.minutes)).toEqual([90]);
	});

	it('leaves out cells that are not billable or have no rate', () => {
		const lines = linesFromCells(
			[
				cell('2026-05-11', 60, { billable: false }),
				cell('2026-05-12', 60, { rate: null }),
				cell('2026-05-13', 15)
			],
			'standard'
		);
		expect(lines.map((line) => line.minutes)).toEqual([15]);
	});

	it('splits a line at the vat change of 1 july 2020', () => {
		const lines = linesFromCells([cell('2020-06-30', 60), cell('2020-07-01', 60)], 'standard');
		expect(lines.map((line) => line.taxRateBp)).toEqual([1900, 1600]);
	});

	it('carries a category without tax onto every line', () => {
		const [line] = linesFromCells([cell('2026-05-11', 60)], 'reverse_charge');
		expect(line).toMatchObject({ taxCategory: 'reverse_charge', taxRateBp: 0 });
	});
});

describe('vatRateFor', () => {
	it('returns 19 and 7 percent today', () => {
		expect(vatRateFor('standard', date('2026-09-25'))).toBe(1900);
		expect(vatRateFor('reduced', date('2026-09-25'))).toBe(700);
	});

	it('returns 16 and 5 percent in the second half of 2020', () => {
		expect(vatRateFor('standard', date('2020-06-30'))).toBe(1900);
		expect(vatRateFor('standard', date('2020-07-01'))).toBe(1600);
		expect(vatRateFor('reduced', date('2020-07-01'))).toBe(500);
		expect(vatRateFor('standard', date('2020-12-31'))).toBe(1600);
		expect(vatRateFor('standard', date('2021-01-01'))).toBe(1900);
		expect(vatRateFor('reduced', date('2021-01-01'))).toBe(700);
	});

	it('gives every other category no rate', () => {
		for (const category of [
			'exempt',
			'reverse_charge',
			'outside_scope',
			'small_business'
		] as const) {
			expect(vatRateFor(category, date('2026-09-25'))).toBe(0);
		}
	});

	it('uses the oldest entry for dates before it', () => {
		expect(vatRateFor('standard', date('2006-12-31'))).toBe(1900);
	});
});

describe('taxTreatment', () => {
	const regular = { taxProfile: 'regular' as const };
	const german = { countryCode: 'DE', isBusiness: true, vatId: 'DE123456789' };

	it('marks every invoice of a small business', () => {
		expect(taxTreatment({ taxProfile: 'small_business' }, german)).toBe('small_business');
		expect(taxTreatment({ taxProfile: 'small_business' }, { ...german, countryCode: 'NL' })).toBe(
			'small_business'
		);
	});

	it('charges german vat for german clients', () => {
		expect(taxTreatment(regular, german)).toBe('standard');
	});

	it('reverses the charge for eu businesses with a vat id', () => {
		expect(taxTreatment(regular, { ...german, countryCode: 'NL', vatId: 'NL123456789B01' })).toBe(
			'reverse_charge'
		);
	});

	it('stays standard for eu businesses without a vat id and for eu consumers', () => {
		expect(taxTreatment(regular, { countryCode: 'AT', isBusiness: true, vatId: null })).toBe(
			'standard'
		);
		expect(taxTreatment(regular, { countryCode: 'AT', isBusiness: false, vatId: null })).toBe(
			'standard'
		);
	});

	it('puts businesses in third countries outside the scope', () => {
		expect(taxTreatment(regular, { countryCode: 'CH', isBusiness: true, vatId: null })).toBe(
			'outside_scope'
		);
	});

	it('stays standard for consumers in third countries', () => {
		expect(taxTreatment(regular, { countryCode: 'US', isBusiness: false, vatId: null })).toBe(
			'standard'
		);
	});
});

const amount = (
	netCents: bigint,
	taxRateBp = 1900,
	taxCategory: Line['taxCategory'] = 'standard'
) => ({
	netCents,
	taxCategory,
	taxRateBp
});

describe('invoiceTotals', () => {
	it('computes the tax of a group from its summed net amount', () => {
		// ten lines of 2 cents: tax per line would round to 0 each, the group sum gives 4 cents
		const totals = invoiceTotals(Array.from({ length: 10 }, () => amount(2n)));
		expect(totals).toMatchObject({ netCents: 20n, taxCents: 4n, grossCents: 24n });
	});

	it('keeps one group per category and rate and explains every sum', () => {
		const totals = invoiceTotals([
			amount(10000n),
			amount(5000n, 700, 'reduced'),
			amount(2500n),
			amount(1000n, 0, 'exempt'),
			amount(1000n, 0, 'reverse_charge')
		]);
		expect(totals.groups).toEqual([
			{
				taxCategory: 'standard',
				taxRateBp: 1900,
				netCents: 12500n,
				taxCents: 2375n,
				explanation: {
					key: 'billing.totals.group',
					params: { taxCategory: 'standard', taxRateBp: 1900, netCents: '12500', taxCents: '2375' }
				}
			},
			expect.objectContaining({ taxCategory: 'reduced', netCents: 5000n, taxCents: 350n }),
			expect.objectContaining({ taxCategory: 'exempt', netCents: 1000n, taxCents: 0n }),
			expect.objectContaining({ taxCategory: 'reverse_charge', netCents: 1000n, taxCents: 0n })
		]);
		expect(totals).toMatchObject({ netCents: 19500n, taxCents: 2725n, grossCents: 22225n });
		expect(totals.explanation).toEqual({
			key: 'billing.totals',
			params: { netCents: '19500', taxCents: '2725', grossCents: '22225' }
		});
	});

	it('is all zero for an invoice without lines', () => {
		expect(invoiceTotals([])).toMatchObject({
			groups: [],
			netCents: 0n,
			taxCents: 0n,
			grossCents: 0n
		});
	});
});

describe('negateLines', () => {
	const lines = linesFromCells(
		[cell('2026-05-11', 7), cell('2026-05-12', 0, { taskId: 't1' })],
		'standard'
	);

	it('negates minutes and net amount, and keeps the tax', () => {
		const [first, second] = negateLines(lines);
		expect(first).toMatchObject({
			minutes: -7,
			netCents: -1108n,
			taxCategory: 'standard',
			taxRateBp: 1900
		});
		expect(Object.is(second?.minutes, 0)).toBe(true);
	});

	it('makes the totals of a cancellation the exact negation of the invoice', () => {
		const invoice = invoiceTotals(lines);
		const cancellation = invoiceTotals(negateLines(lines));
		expect(cancellation.netCents).toBe(-invoice.netCents);
		expect(cancellation.taxCents).toBe(-invoice.taxCents);
		expect(cancellation.grossCents).toBe(-invoice.grossCents);
	});
});

describe('isSmallAmountInvoice', () => {
	it('allows up to 250 euros gross', () => {
		expect(isSmallAmountInvoice(25000n, 'standard')).toBe(true);
		expect(isSmallAmountInvoice(25001n, 'standard')).toBe(false);
	});

	it('looks at the amount, so the cancellation of a small invoice stays small', () => {
		expect(isSmallAmountInvoice(-25000n, 'standard')).toBe(true);
		expect(isSmallAmountInvoice(-25001n, 'standard')).toBe(false);
	});

	it('never applies to reverse charge', () => {
		expect(isSmallAmountInvoice(100n, 'reverse_charge')).toBe(false);
	});

	it('still applies to third countries', () => {
		expect(isSmallAmountInvoice(100n, 'outside_scope')).toBe(true);
	});
});

describe('smallBusinessCheck', () => {
	const year = 2026;

	it('is fine below both limits', () => {
		expect(
			smallBusinessCheck({
				previousYearRevenueCents: 2_500_000n,
				issuedThisYearCents: 9_000_000n,
				draftCents: 1_000_000n,
				year
			})
		).toEqual({
			state: 'ok',
			explanation: {
				key: 'billing.small_business.ok',
				params: {
					issuedThisYearCents: '9000000',
					withDraftCents: '10000000',
					limitCents: '10000000'
				}
			}
		});
	});

	it('warns when the previous year was above 25,000 euros', () => {
		expect(
			smallBusinessCheck({
				previousYearRevenueCents: 2_500_001n,
				issuedThisYearCents: 0n,
				draftCents: 100n,
				year
			})
		).toEqual({
			state: 'previous_year_exceeded',
			explanation: {
				key: 'billing.small_business.previous_year_exceeded',
				params: { previousYearRevenueCents: '2500001', limitCents: '2500000' }
			}
		});
	});

	it('flags the invoice that crosses 100,000 euros', () => {
		const check = smallBusinessCheck({
			previousYearRevenueCents: 0n,
			issuedThisYearCents: 9_950_000n,
			draftCents: 50_001n,
			year
		});
		expect(check.state).toBe('crosses_current_limit');
		expect(check.explanation.key).toBe('billing.small_business.crosses_current_limit');
	});

	it('keeps warning on every invoice after the limit was crossed', () => {
		const check = smallBusinessCheck({
			previousYearRevenueCents: 0n,
			issuedThisYearCents: 10_000_001n,
			draftCents: 100n,
			year
		});
		expect(check.state).toBe('crosses_current_limit');
		expect(check.explanation.key).toBe('billing.small_business.already_crossed');
	});

	it('applies the 2025 limits to earlier years as well', () => {
		const check = smallBusinessCheck({
			previousYearRevenueCents: 2_500_001n,
			issuedThisYearCents: 0n,
			draftCents: 0n,
			year: 2024
		});
		expect(check.state).toBe('previous_year_exceeded');
	});
});

describe('invoiceForm', () => {
	const complete = { hasVatId: true, hasTaxNumber: true };
	const form = (overrides: Partial<Parameters<typeof invoiceForm>[0]> = {}) =>
		invoiceForm({
			grossCents: 100_000n,
			treatment: 'standard',
			isBusiness: true,
			profile: complete,
			...overrides
		});

	it('needs nothing extra for a regular b2b invoice', () => {
		expect(form()).toEqual({ legalNotes: [], blockers: [], hints: [] });
	});

	it('prints the § 19 note for a small business', () => {
		expect(form({ treatment: 'small_business' }).legalNotes).toEqual(['small_business_19']);
	});

	it('prints the § 13b note and the deadline hint for reverse charge', () => {
		expect(form({ treatment: 'reverse_charge' })).toEqual({
			legalNotes: ['reverse_charge_13b'],
			blockers: [],
			hints: ['service_deadline_14a_3']
		});
	});

	it('blocks reverse charge without the own vat id, a tax number is not enough', () => {
		expect(
			form({ treatment: 'reverse_charge', profile: { hasVatId: false, hasTaxNumber: true } })
				.blockers
		).toEqual(['vat_id_missing']);
	});

	it('blocks an invoice without tax number and vat id', () => {
		const none = { hasVatId: false, hasTaxNumber: false };
		expect(form({ profile: none }).blockers).toEqual(['tax_number_missing']);
		expect(form({ profile: { hasVatId: false, hasTaxNumber: true } }).blockers).toEqual([]);
		expect(form({ profile: { hasVatId: true, hasTaxNumber: false } }).blockers).toEqual([]);
	});

	it('lets a small amount invoice go without tax number', () => {
		const none = { hasVatId: false, hasTaxNumber: false };
		expect(form({ grossCents: 25_000n, profile: none }).blockers).toEqual([]);
	});

	it('asks for the reason of an exemption', () => {
		expect(form({ treatment: 'exempt' }).legalNotes).toEqual(['exempt_reason']);
	});

	it('adds the § 286 note for consumers only', () => {
		expect(form({ isBusiness: false }).legalNotes).toEqual(['late_payment_286_consumer']);
		expect(form({ isBusiness: false, treatment: 'small_business' }).legalNotes).toEqual([
			'small_business_19',
			'late_payment_286_consumer'
		]);
	});
});

describe('budgetStatus', () => {
	it('is fine below 80 percent', () => {
		expect(budgetStatus(1895, 2400)).toEqual({
			state: 'ok',
			ratio: fraction(1895, 2400),
			explanation: { key: 'billing.budget.ok', params: { usedMinutes: 1895, budgetMinutes: 2400 } }
		});
	});

	it('warns from 80 percent up to the full budget', () => {
		expect(budgetStatus(1920, 2400).state).toBe('warn');
		expect(budgetStatus(2400, 2400).state).toBe('warn');
		expect(budgetStatus(2400, 2400).ratio).toEqual(fraction(1));
	});

	it('reports anything above the budget as exceeded', () => {
		expect(budgetStatus(2401, 2400)).toMatchObject({
			state: 'exceeded',
			explanation: { key: 'billing.budget.exceeded' }
		});
	});
});

const anyRaw = fc.integer({ min: 0, max: 3 * 24 * 60 });
const anyIncrement = fc.integer({ min: 1, max: 120 });
const anyMode = fc.constantFrom('up', 'nearest', 'down');
const anyRule = fc.record({ incrementMinutes: anyIncrement, mode: anyMode });
const anyOverride = fc.record({
	incrementMinutes: fc.option(anyIncrement, { nil: null }),
	mode: fc.option(anyMode, { nil: null })
});

describe('rounding properties', () => {
	test.prop([anyRaw, anyIncrement], { numRuns: 1000 })(
		'rounding up adds at most one increment minus a minute (T-06)',
		(raw, increment) => {
			const { minutes } = roundMinutes(raw, { increment, mode: 'up' });
			expect(minutes).toBeGreaterThanOrEqual(raw);
			expect(minutes - raw).toBeLessThanOrEqual(increment - 1);
		}
	);

	test.prop([anyRaw, anyIncrement], { numRuns: 1000 })(
		'rounding down never bills more than was booked',
		(raw, increment) => {
			const { minutes } = roundMinutes(raw, { increment, mode: 'down' });
			expect(minutes).toBeLessThanOrEqual(raw);
			expect(raw - minutes).toBeLessThanOrEqual(increment - 1);
		}
	);

	test.prop([anyRaw, anyIncrement], { numRuns: 1000 })(
		'rounding to the nearest increment moves by at most half of it',
		(raw, increment) => {
			const { minutes } = roundMinutes(raw, { increment, mode: 'nearest' });
			expect(Math.abs(minutes - raw)).toBeLessThanOrEqual(increment / 2);
		}
	);

	test.prop([anyRaw, anyIncrement, anyMode], { numRuns: 1000 })(
		'every result is a multiple of the increment',
		(raw, increment, mode) => {
			expect(roundMinutes(raw, { increment, mode }).minutes % increment).toBe(0);
		}
	);

	test.prop([anyRaw, anyIncrement, anyMode], { numRuns: 1000 })(
		'no mode turns booked time negative',
		(raw, increment, mode) => {
			expect(roundMinutes(raw, { increment, mode }).minutes).toBeGreaterThanOrEqual(0);
		}
	);

	test.prop([anyRaw, anyIncrement, anyMode], { numRuns: 1000 })(
		'rounding a rounded value again changes nothing',
		(raw, increment, mode) => {
			const once = roundMinutes(raw, { increment, mode }).minutes;
			expect(roundMinutes(once, { increment, mode }).minutes).toBe(once);
		}
	);

	test.prop([anyRaw, anyRaw, anyIncrement, anyMode], { numRuns: 1000 })(
		'more booked time never rounds to less',
		(a, b, increment, mode) => {
			const [less, more] = a <= b ? [a, b] : [b, a];
			expect(roundMinutes(less, { increment, mode }).minutes).toBeLessThanOrEqual(
				roundMinutes(more, { increment, mode }).minutes
			);
		}
	);

	test.prop([anyRaw, anyIncrement], { numRuns: 1000 })(
		'down, nearest and up stay in that order',
		(raw, increment) => {
			const to = (mode: RoundingMode) => roundMinutes(raw, { increment, mode }).minutes;
			expect(to('down')).toBeLessThanOrEqual(to('nearest'));
			expect(to('nearest')).toBeLessThanOrEqual(to('up'));
		}
	);

	test.prop([anyRule, anyOverride, anyOverride], { numRuns: 1000 })(
		'the project overrides the client and the client the profile, increment and mode apart',
		(profile, client, project) => {
			const { rule, explanation } = roundingFor(profile, client, project);
			expect(rule).toEqual({
				incrementMinutes:
					project.incrementMinutes ?? client.incrementMinutes ?? profile.incrementMinutes,
				mode: project.mode ?? client.mode ?? profile.mode
			});
			const levels: Record<string, RoundingOverride> = { project, client, profile };
			expect(levels[String(explanation.params.incrementFrom)]?.incrementMinutes).toBe(
				rule.incrementMinutes
			);
			expect(levels[String(explanation.params.modeFrom)]?.mode).toBe(rule.mode);
		}
	);
});

const LEVELS: readonly RateLevel[] = [
	'task_employee',
	'task',
	'project_employee',
	'project',
	'client_employee',
	'client',
	'employee',
	'default'
];
const dimsOf: Record<RateLevel, Partial<Rate>> = {
	task_employee: { clientId: 'c1', projectId: 'p1', taskId: 't1', employeeId: 'e1' },
	task: { clientId: 'c1', projectId: 'p1', taskId: 't1' },
	project_employee: { clientId: 'c1', projectId: 'p1', employeeId: 'e1' },
	project: { clientId: 'c1', projectId: 'p1' },
	client_employee: { clientId: 'c1', employeeId: 'e1' },
	client: { clientId: 'c1' },
	employee: { employeeId: 'e1' },
	default: {}
};
const FOREIGN: readonly Partial<Rate>[] = [
	{ clientId: 'c2' },
	{ clientId: 'c1', projectId: 'p2' },
	{ clientId: 'c1', projectId: 'p1', taskId: 't2' },
	{ employeeId: 'e2' },
	{ clientId: 'c1', projectId: 'p1', taskId: 't1', employeeId: 'e2' }
];
const serviceQuery = (day: number) => ({
	clientId: 'c1',
	projectId: 'p1',
	taskId: 't1',
	employeeId: 'e1',
	date: date('2025-01-01').add({ days: day })
});

const anyServiceDay = fc.integer({ min: 0, max: 4 * 365 });
const anyShift = fc.integer({ min: -1000, max: 400 });
const anyCents = fc.bigInt({ min: 0n, max: 50_000n });
const anyRate = fc.record({
	level: fc.constantFrom(...LEVELS),
	foreign: fc.option(fc.constantFrom(...FOREIGN), { nil: null, freq: 2 }),
	shift: anyShift,
	cents: anyCents
});

describe('resolveRate properties', () => {
	test.prop(
		[
			fc.constantFrom(...LEVELS.slice(0, -1)),
			fc.integer({ min: 0, max: 1000 }),
			fc.array(fc.record({ pick: fc.nat(), shift: anyShift, cents: anyCents }), { maxLength: 10 }),
			fc.nat(),
			anyServiceDay
		],
		{ numRuns: 1000 }
	)(
		'a more specific rate in force beats every general one, however new',
		(level, age, general, position, day) => {
			const query = serviceQuery(day);
			const wider = LEVELS.slice(LEVELS.indexOf(level) + 1);
			const specific = rate('specific', 15000n, {
				...dimsOf[level],
				validFrom: query.date.subtract({ days: age })
			});
			const rates = general.map(({ pick, shift, cents }, i) =>
				rate(`general${i}`, cents, {
					...dimsOf[wider[pick % wider.length]!],
					validFrom: query.date.add({ days: shift })
				})
			);
			expect(
				resolveRate(rates.toSpliced(position % (rates.length + 1), 0, specific), query)
			).toMatchObject({ rateId: 'specific', level });
		}
	);

	test.prop([fc.array(anyRate, { maxLength: 12 }), anyServiceDay], { numRuns: 1000 })(
		'never picks a rate that has not started yet or belongs to someone else',
		(drawn, day) => {
			const query = serviceQuery(day);
			const rates = drawn.map(({ level, foreign, shift, cents }, i) =>
				rate(`r${i}`, cents, {
					...(foreign ?? dimsOf[level]),
					validFrom: query.date.add({ days: shift })
				})
			);
			const excluded = drawn.flatMap(({ foreign, shift }, i) =>
				foreign !== null || shift > 0 ? [`r${i}`] : []
			);
			const found = resolveRate(rates, query);
			expect(excluded).not.toContain(found?.rateId);
			expect(found === null).toBe(excluded.length === rates.length);
		}
	);

	test.prop(
		[
			fc.constantFrom(...LEVELS),
			fc.array(fc.record({ shift: anyShift, cents: anyCents }), { maxLength: 8 }),
			anyServiceDay
		],
		{ numRuns: 1000 }
	)('within one level the newest rate in force counts', (level, drawn, day) => {
		const query = serviceQuery(day);
		const rates = drawn.map(({ shift, cents }, i) =>
			rate(`r${i}`, cents, { ...dimsOf[level], validFrom: query.date.add({ days: shift }) })
		);
		const newest = rates
			.map((candidate) => candidate.validFrom)
			.filter((validFrom) => Temporal.PlainDate.compare(validFrom, query.date) <= 0)
			.toSorted(Temporal.PlainDate.compare)
			.at(-1);
		const found = resolveRate(rates, query);
		expect(rates.find((candidate) => candidate.id === found?.rateId)?.validFrom).toEqual(newest);
	});
});

const clock = (seconds: number) =>
	Temporal.PlainDateTime.from('2026-05-12T07:00').add({ seconds }).toString();

const anyBooking = fc.record({
	// ends by 23:00, a piece past midnight would belong to the next workday
	startSecond: fc.integer({ min: 0, max: 6 * 3600 }),
	// whole minutes, at exactly x min 30 s wholeMinutes rounds differently depending on the split
	minutes: fc.integer({ min: 1, max: 600 }),
	cuts: fc.array(fc.nat(), { maxLength: 19 }),
	increment: anyIncrement,
	mode: anyMode,
	cents: anyCents
});

// days from 1 June 2020, so some cells fall past the switch to 16 %
const anyCells = fc
	.array(
		fc.record({
			day: fc.integer({ min: 0, max: 60 }),
			minutes: fc.integer({ min: 0, max: 600 }),
			projectId: fc.constantFrom('p1', 'p2'),
			taskId: fc.constantFrom(null, 't1'),
			billable: fc.boolean(),
			cents: fc.option(fc.constantFrom(9000n, 9500n, 12000n), { nil: null })
		}),
		{ maxLength: 20 }
	)
	.map((drawn) =>
		drawn.map(({ day, minutes, cents, ...dims }, i) =>
			cell(date('2020-06-01').add({ days: day }).toString(), minutes, {
				...dims,
				entryIds: [`entry${i}`],
				rate:
					cents === null
						? null
						: {
								cents,
								level: 'default',
								rateId: `r${cents}`,
								explanation: { key: 'x', params: {} }
							}
			})
		)
	);

const abs = (n: bigint) => (n < 0n ? -n : n);

describe('aggregate properties', () => {
	test.prop([anyBooking], { numRuns: 1000 })(
		'splitting a booking into pieces changes neither the billed minutes nor the amount (T-06)',
		({ startSecond, minutes, cuts, increment, mode, cents }) => {
			const length = minutes * 60;
			const inner = [...new Set(cuts.map((cut) => cut % length))]
				.filter((cut) => cut > 0)
				.toSorted((a, b) => a - b);
			const pieces = [...inner, length].map((end, i, ends) =>
				entry(`part${i}`, clock(startSecond + (ends[i - 1] ?? 0)), clock(startSecond + end))
			);
			const context = {
				rates: [rate('default', cents)],
				rounding: () => ({ incrementMinutes: increment, mode })
			};
			const whole = aggregate(
				[entry('whole', clock(startSecond), clock(startSecond + length))],
				context
			);
			const split = aggregate(pieces, context);

			expect(split).toHaveLength(1);
			expect(split[0]).toMatchObject({
				rawMinutes: minutes,
				roundedMinutes: whole[0]?.roundedMinutes,
				entryIds: pieces.map((piece) => piece.id)
			});
			expect(linesFromCells(split, 'standard')[0]?.netCents).toBe(
				linesFromCells(whole, 'standard')[0]?.netCents
			);
		}
	);

	test.prop([anyCells], { numRuns: 1000 })(
		'the lines carry exactly the minutes and entries of the billable cells with a rate',
		(cells) => {
			const billed = cells.filter((candidate) => candidate.billable && candidate.rate);
			const lines = linesFromCells(cells, 'standard');
			expect(lines.reduce((sum, line) => sum + line.minutes, 0)).toBe(
				billed.reduce((sum, candidate) => sum + candidate.roundedMinutes, 0)
			);
			expect(lines.flatMap((line) => line.entryIds).toSorted()).toEqual(
				billed.flatMap((candidate) => candidate.entryIds).toSorted()
			);
		}
	);

	test.prop([anyCells], { numRuns: 1000 })(
		'a line is priced within half a cent and never straddles a vat change',
		(cells) => {
			for (const line of linesFromCells(cells, 'standard')) {
				const exact = BigInt(line.minutes) * line.rateCents;
				expect(2n * abs(exact - line.netCents * 60n)).toBeLessThanOrEqual(60n);
				expect(vatRateFor('standard', line.serviceFrom)).toBe(line.taxRateBp);
				expect(vatRateFor('standard', line.serviceTo)).toBe(line.taxRateBp);
			}
		}
	);
});

const TAX_GROUPS = [
	{ taxCategory: 'standard', taxRateBp: 1900 },
	{ taxCategory: 'standard', taxRateBp: 1600 },
	{ taxCategory: 'reduced', taxRateBp: 700 },
	{ taxCategory: 'reduced', taxRateBp: 500 },
	{ taxCategory: 'exempt', taxRateBp: 0 },
	{ taxCategory: 'reverse_charge', taxRateBp: 0 },
	{ taxCategory: 'outside_scope', taxRateBp: 0 },
	{ taxCategory: 'small_business', taxRateBp: 0 }
] as const;

// negative amounts are discount lines
const anyNet = fc.bigInt({ min: -10_000_000n, max: 10_000_000n });
const anyAmount = fc
	.record({ netCents: anyNet, group: fc.constantFrom(...TAX_GROUPS) })
	.map(({ netCents, group }) => amount(netCents, group.taxRateBp, group.taxCategory));
const anyLine = fc
	.record({
		minutes: fc.integer({ min: 0, max: 10_000 }),
		rateCents: anyCents,
		netCents: anyNet,
		taskId: fc.constantFrom(null, 't1'),
		group: fc.constantFrom(...TAX_GROUPS)
	})
	.map(({ group, ...line }): Line => ({
		projectId: 'p1',
		serviceFrom: date('2026-05-01'),
		serviceTo: date('2026-05-31'),
		entryIds: [],
		...line,
		...group
	}));

describe('invoiceTotals properties', () => {
	test.prop([fc.array(anyAmount, { maxLength: 30 })], { numRuns: 1000 })(
		'the invoice adds up its lines and its groups',
		(lines) => {
			const totals = invoiceTotals(lines);
			expect(totals.netCents).toBe(lines.reduce((sum, line) => sum + line.netCents, 0n));
			expect(totals.taxCents).toBe(totals.groups.reduce((sum, group) => sum + group.taxCents, 0n));
			expect(totals.grossCents).toBe(totals.netCents + totals.taxCents);
		}
	);

	test.prop([fc.array(anyAmount, { maxLength: 30 })], { numRuns: 1000 })(
		'every group takes its tax from its summed net amount (BR-CO-17)',
		(lines) => {
			const { groups } = invoiceTotals(lines);
			const key = (taxed: { taxCategory: string; taxRateBp: number }) =>
				`${taxed.taxCategory}|${taxed.taxRateBp}`;
			expect(groups).toHaveLength(new Set(lines.map(key)).size);
			for (const group of groups) {
				const members = lines.filter((line) => key(line) === key(group));
				expect(group.netCents).toBe(members.reduce((sum, line) => sum + line.netCents, 0n));
				expect(group.taxCents).toBe(percentOf(group.netCents, group.taxRateBp));
			}
		}
	);

	test.prop([fc.array(anyAmount, { maxLength: 30 })], { numRuns: 1000 })(
		'the order of the lines changes no sum',
		(lines) => {
			const { netCents, taxCents, grossCents } = invoiceTotals(lines);
			expect(invoiceTotals(lines.toReversed())).toMatchObject({ netCents, taxCents, grossCents });
		}
	);

	test.prop([fc.array(anyLine, { maxLength: 20 })], { numRuns: 1000 })(
		'the totals of a cancellation are the exact negation of the invoice, group by group',
		(lines) => {
			const invoice = invoiceTotals(lines);
			const cancellation = invoiceTotals(negateLines(lines));
			expect(cancellation).toMatchObject({
				netCents: -invoice.netCents,
				taxCents: -invoice.taxCents,
				grossCents: -invoice.grossCents
			});
			expect(cancellation.groups).toEqual(
				invoice.groups.map((group) =>
					expect.objectContaining({
						taxCategory: group.taxCategory,
						taxRateBp: group.taxRateBp,
						netCents: -group.netCents,
						taxCents: -group.taxCents
					})
				)
			);
			expect(invoiceTotals([...lines, ...negateLines(lines)])).toMatchObject({
				netCents: 0n,
				taxCents: 0n,
				grossCents: 0n
			});
		}
	);

	test.prop([fc.array(anyLine, { maxLength: 20 })], { numRuns: 1000 })(
		'cancelling a cancellation gives the invoice lines back',
		(lines) => {
			expect(negateLines(negateLines(lines))).toEqual(lines);
		}
	);
});

const anyTreatment = fc.constantFrom(...TAX_GROUPS.map((group) => group.taxCategory));
const anyGross = fc.bigInt({ min: -1_000_000n, max: 1_000_000n });

describe('invoice check properties', () => {
	test.prop([anyGross, anyTreatment], { numRuns: 1000 })(
		'a cancellation keeps the small amount status of its invoice',
		(grossCents, treatment) => {
			expect(isSmallAmountInvoice(-grossCents, treatment)).toBe(
				isSmallAmountInvoice(grossCents, treatment)
			);
		}
	);

	test.prop([anyGross, fc.boolean(), fc.boolean(), fc.boolean()], { numRuns: 1000 })(
		'reverse charge always carries its note and deadline and is never a small amount invoice',
		(grossCents, isBusiness, hasVatId, hasTaxNumber) => {
			const form = invoiceForm({
				grossCents,
				treatment: 'reverse_charge',
				isBusiness,
				profile: { hasVatId, hasTaxNumber }
			});
			expect(form.legalNotes).toContain('reverse_charge_13b');
			expect(form.hints).toEqual(['service_deadline_14a_3']);
			expect(form.blockers).toEqual(hasVatId ? [] : ['vat_id_missing']);
			expect(isSmallAmountInvoice(grossCents, 'reverse_charge')).toBe(false);
		}
	);

	test.prop(
		[
			fc.bigInt({ min: -25_000n, max: 25_000n }),
			anyTreatment.filter((treatment) => treatment !== 'reverse_charge'),
			fc.boolean()
		],
		{ numRuns: 1000 }
	)(
		'an invoice up to 250 euros never asks for a tax number',
		(grossCents, treatment, isBusiness) => {
			const form = invoiceForm({
				grossCents,
				treatment,
				isBusiness,
				profile: { hasVatId: false, hasTaxNumber: false }
			});
			expect(form.blockers).toEqual([]);
		}
	);

	const anyRevenue = fc.bigInt({ min: 0n, max: 15_000_000n });
	const SMALL_BUSINESS_STATES = ['ok', 'crosses_current_limit', 'previous_year_exceeded'];

	test.prop([fc.bigInt({ min: 0n, max: 3_000_000n }), anyRevenue, anyRevenue, anyRevenue], {
		numRuns: 1000
	})(
		'a larger draft never turns a small business warning back into ok',
		(previousYearRevenueCents, issuedThisYearCents, a, b) => {
			const [smaller, larger] = a <= b ? [a, b] : [b, a];
			const rank = (draftCents: bigint) =>
				SMALL_BUSINESS_STATES.indexOf(
					smallBusinessCheck({
						previousYearRevenueCents,
						issuedThisYearCents,
						draftCents,
						year: 2026
					}).state
				);
			expect(rank(smaller)).toBeLessThanOrEqual(rank(larger));
		}
	);

	const BUDGET_STATES = ['ok', 'warn', 'exceeded'];
	const anyUsed = fc.nat({ max: 100_000 });
	const anyBudget = fc.integer({ min: 1, max: 100_000 });

	test.prop([anyUsed, anyUsed, anyBudget], { numRuns: 1000 })(
		'more minutes used never lower the budget state',
		(a, b, budget) => {
			const [less, more] = a <= b ? [a, b] : [b, a];
			expect(BUDGET_STATES.indexOf(budgetStatus(less, budget).state)).toBeLessThanOrEqual(
				BUDGET_STATES.indexOf(budgetStatus(more, budget).state)
			);
		}
	);

	test.prop([anyUsed, anyBudget], { numRuns: 1000 })(
		'the budget thresholds sit at exactly 80 and 100 percent',
		(used, budget) => {
			const { state, ratio } = budgetStatus(used, budget);
			expect(state === 'exceeded').toBe(used > budget);
			expect(state === 'ok').toBe(5 * used < 4 * budget);
			expect(ratio).toEqual(fraction(used, budget));
		}
	);
});
