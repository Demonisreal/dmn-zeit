import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { fraction } from '../fraction';
import type { Holiday } from '../holidays';
import { contractOn, targetMinutes, type Contract, type Employment } from './index';

const day = (text: string) => Temporal.PlainDate.from(text);

const contract = (validFrom: string, weekdayMinutes: number): Contract => ({
	validFrom: day(validFrom),
	minutes: {
		mon: weekdayMinutes,
		tue: weekdayMinutes,
		wed: weekdayMinutes,
		thu: weekdayMinutes,
		fri: weekdayMinutes,
		sat: 0,
		sun: 0
	},
	vacationDaysYear: fraction(30),
	vacationBasisDays: 5,
	capOverride: null
});

const fullTime = contract('2024-01-01', 480);
const partTime = contract('2026-04-01', 465);

const employment: Employment = {
	entryDate: day('2024-01-01'),
	exitDate: day('2026-12-31'),
	contracts: [partTime, fullTime]
};

const holiday = (date: string, portion: 0.5 | 1): Holiday => ({
	date: day(date),
	code: portion === 1 ? 'christmas_day' : 'christmas_eve',
	portion
});

describe('contractOn', () => {
	it('finds nothing before the first contract starts', () => {
		expect(contractOn(employment, day('2023-12-31'))).toBeUndefined();
	});

	it('picks the latest contract that has started, whatever the list order', () => {
		expect(contractOn(employment, day('2026-03-31'))).toBe(fullTime);
		expect(contractOn(employment, day('2026-09-15'))).toBe(partTime);
	});

	it('switches to the new contract on its first day', () => {
		expect(contractOn(employment, day('2026-04-01'))).toBe(partTime);
	});
});

describe('targetMinutes', () => {
	it('takes the minutes of the weekday from the contract', () => {
		expect(targetMinutes(employment, day('2026-03-18'), null)).toEqual({
			minutes: 480,
			explanation: { key: 'target.workday', params: { weekday: 'wed', minutes: 480 } }
		});
	});

	it('expects nothing on a sunday without contract minutes', () => {
		expect(targetMinutes(employment, day('2026-03-22'), null)).toEqual({
			minutes: 0,
			explanation: { key: 'target.workday', params: { weekday: 'sun', minutes: 0 } }
		});
	});

	it('follows a contract change from one day to the next', () => {
		expect(targetMinutes(employment, day('2026-03-31'), null).minutes).toBe(480);
		expect(targetMinutes(employment, day('2026-04-01'), null).minutes).toBe(465);
	});

	it('expects nothing on a full holiday', () => {
		expect(targetMinutes(employment, day('2025-12-25'), holiday('2025-12-25', 1))).toEqual({
			minutes: 0,
			explanation: { key: 'target.holiday', params: { code: 'christmas_day' } }
		});
	});

	it('halves the target on a half holiday and rounds to whole minutes', () => {
		expect(targetMinutes(employment, day('2026-12-24'), holiday('2026-12-24', 0.5))).toEqual({
			minutes: 233,
			explanation: { key: 'target.half_holiday', params: { code: 'christmas_eve', minutes: 233 } }
		});
	});

	it('expects nothing before entry and after exit', () => {
		const outside = { minutes: 0, explanation: { key: 'target.outside_employment', params: {} } };
		expect(targetMinutes(employment, day('2023-12-29'), null)).toEqual(outside);
		expect(targetMinutes(employment, day('2027-01-04'), null)).toEqual(outside);
	});

	it('still counts the exit date itself', () => {
		expect(targetMinutes(employment, day('2026-12-31'), null).minutes).toBe(465);
	});

	it('reports outside employment before looking at the holiday', () => {
		const target = targetMinutes(employment, day('2023-12-25'), holiday('2023-12-25', 1));
		expect(target.explanation.key).toBe('target.outside_employment');
	});

	it('keeps counting when no exit date is set', () => {
		const open: Employment = { ...employment, exitDate: null };
		expect(targetMinutes(open, day('2031-06-02'), null).minutes).toBe(465);
	});

	it('reports a missing contract when employment starts before the first one', () => {
		const early: Employment = { ...employment, entryDate: day('2023-12-01') };
		expect(targetMinutes(early, day('2023-12-04'), null)).toEqual({
			minutes: 0,
			explanation: { key: 'target.no_contract', params: {} }
		});
	});
});
