import { fc, test } from '@fast-check/vitest';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { targetMinutes, type Employment } from '../contracts';
import { fraction } from '../fraction';
import type { Holiday } from '../holidays';
import { daysForRange } from '../vacation';
import { accountBalance, applyCap, dayBalance, type DayMinutes, type FlexBooking } from './index';

const worked = (workedMinutes: number, targetMinutes = 480): DayMinutes => ({
	targetMinutes,
	workedMinutes,
	creditedMinutes: 0
});

describe('dayBalance', () => {
	it('credits minutes worked beyond the target', () => {
		expect(dayBalance(worked(510))).toBe(30);
	});

	it('leaves a vacation day neutral', () => {
		expect(dayBalance({ targetMinutes: 480, workedMinutes: 0, creditedMinutes: 480 })).toBe(0);
	});

	it('charges the full target for a day of time off', () => {
		expect(dayBalance(worked(0))).toBe(-480);
	});

	it('counts work on a day without target entirely as plus', () => {
		expect(dayBalance(worked(240, 0))).toBe(240);
	});
});

describe('dayBalance on holidays', () => {
	const date = (iso: string) => Temporal.PlainDate.from(iso);
	const staff: Employment = {
		entryDate: date('2020-01-01'),
		exitDate: null,
		contracts: [
			{
				validFrom: date('2020-01-01'),
				minutes: { mon: 480, tue: 480, wed: 480, thu: 480, fri: 480, sat: 0, sun: 0 },
				vacationDaysYear: fraction(30),
				vacationBasisDays: 5,
				capOverride: null
			}
		]
	};
	const labourDay: Holiday = { date: date('2026-05-01'), code: 'labour_day', portion: 1 };
	const christmasEve: Holiday = { date: date('2026-12-24'), code: 'christmas_eve', portion: 0.5 };
	const on = (holiday: Holiday, workedMinutes: number, creditedMinutes = 0): DayMinutes => ({
		targetMinutes: targetMinutes(staff, holiday.date, holiday).minutes,
		workedMinutes,
		creditedMinutes
	});

	it('leaves a holiday neutral through the zero target, with nothing credited', () => {
		expect(dayBalance(on(labourDay, 0))).toBe(0);
	});

	it('counts work on a holiday entirely as plus', () => {
		expect(dayBalance(on(labourDay, 240))).toBe(240);
	});

	it('credits only the other half of christmas eve for a vacation day', () => {
		const [cost] = daysForRange(
			{ start: christmasEve.date, end: christmasEve.date, halfDayStart: false, halfDayEnd: false },
			staff,
			[christmasEve]
		);
		expect(cost?.targetMinutes).toBe(240);
		expect(dayBalance(on(christmasEve, 0, cost?.targetMinutes))).toBe(0);
	});

	it('charges half the target for time off on christmas eve', () => {
		expect(dayBalance(on(christmasEve, 0))).toBe(-240);
	});
});

describe('accountBalance', () => {
	it('adds signed bookings to the day balances', () => {
		const bookings: FlexBooking[] = [
			{ type: 'opening', minutes: 600 },
			{ type: 'payout', minutes: -120 },
			{ type: 'manual', minutes: -15 }
		];
		expect(accountBalance([worked(510), worked(450), worked(0)], bookings)).toBe(-15);
	});

	it('is zero for an empty account', () => {
		expect(accountBalance([], [])).toBe(0);
	});
});

describe('applyCap', () => {
	const cap = { plusMinutes: 2400, minusMinutes: 600 };

	it('leaves the balance alone without a cap mode', () => {
		expect(applyCap(5000, cap, 'none')).toEqual({
			kept: 5000,
			forfeited: 0,
			explanation: { key: 'flex.cap.none', params: {} }
		});
	});

	it('warns about a balance above the limit without cutting it', () => {
		expect(applyCap(2500, cap, 'warn')).toEqual({
			kept: 2500,
			forfeited: 0,
			explanation: { key: 'flex.cap.warn_over', params: { balanceMinutes: 2500 } }
		});
	});

	it('warns about a balance below the limit without cutting it', () => {
		expect(applyCap(-700, cap, 'warn')).toEqual({
			kept: -700,
			forfeited: 0,
			explanation: { key: 'flex.cap.warn_under', params: { balanceMinutes: -700 } }
		});
	});

	it('stays silent on a balance right at the limits', () => {
		expect(applyCap(2400, cap, 'warn').explanation.key).toBe('flex.cap.warn_ok');
		expect(applyCap(-600, cap, 'warn').explanation.key).toBe('flex.cap.warn_ok');
	});

	it('forfeits the minutes above the limit at closing', () => {
		expect(applyCap(2520, cap, 'forfeit_at_close')).toEqual({
			kept: 2400,
			forfeited: 120,
			explanation: { key: 'flex.cap.forfeit_over', params: { forfeited: 120 } }
		});
	});

	it('forfeits the minutes below the limit as a negative amount', () => {
		expect(applyCap(-660, cap, 'forfeit_at_close')).toEqual({
			kept: -600,
			forfeited: -60,
			explanation: { key: 'flex.cap.forfeit_under', params: { forfeited: -60 } }
		});
	});

	it('keeps a balance within the limits as it is', () => {
		expect(applyCap(-600, cap, 'forfeit_at_close')).toEqual({
			kept: -600,
			forfeited: 0,
			explanation: { key: 'flex.cap.forfeit_ok', params: {} }
		});
	});

	it('never caps in a direction without a limit', () => {
		const open = { plusMinutes: null, minusMinutes: null };
		expect(applyCap(99999, open, 'forfeit_at_close').kept).toBe(99999);
		expect(applyCap(-99999, open, 'forfeit_at_close').kept).toBe(-99999);
		expect(applyCap(99999, open, 'warn').explanation.key).toBe('flex.cap.warn_ok');
	});

	it('keeps plain zero when no minus is allowed at all', () => {
		expect(applyCap(-30, { plusMinutes: null, minusMinutes: 0 }, 'forfeit_at_close')).toEqual({
			kept: 0,
			forfeited: -30,
			explanation: { key: 'flex.cap.forfeit_under', params: { forfeited: -30 } }
		});
	});
});

const anyDay = fc.record({
	targetMinutes: fc.integer({ min: 0, max: 720 }),
	workedMinutes: fc.integer({ min: 0, max: 900 }),
	creditedMinutes: fc.integer({ min: 0, max: 720 })
});
const anyBooking = fc.record({
	type: fc.constantFrom('opening', 'manual', 'payout', 'cap_forfeit'),
	minutes: fc.integer({ min: -1000, max: 1000 })
});
const anyLimit = fc.option(fc.integer({ min: 0, max: 10000 }), { nil: null });

describe('flextime properties', () => {
	test.prop([fc.array(anyDay), fc.array(anyBooking), fc.nat(), fc.nat()], { numRuns: 1000 })(
		'the balance is the sum of its parts in any split and order',
		(days, bookings, dayPick, bookingPick) => {
			const total = accountBalance(days, bookings);
			const dayCut = dayPick % (days.length + 1);
			const bookingCut = bookingPick % (bookings.length + 1);
			expect(
				accountBalance(days.slice(0, dayCut), bookings.slice(0, bookingCut)) +
					accountBalance(days.slice(dayCut), bookings.slice(bookingCut))
			).toBe(total);
			expect(accountBalance(days.toReversed(), bookings.toReversed())).toBe(total);
			expect(
				days.reduce((sum, day) => sum + dayBalance(day), 0) +
					bookings.reduce((sum, booking) => sum + booking.minutes, 0)
			).toBe(total);
		}
	);

	test.prop([fc.array(anyDay), fc.array(anyBooking), fc.integer({ min: 0, max: 720 }), fc.nat()], {
		numRuns: 1000
	})(
		'a day of time off lowers the balance by exactly its target',
		(days, bookings, target, pick) => {
			const timeOff = { targetMinutes: target, workedMinutes: 0, creditedMinutes: 0 };
			const index = pick % (days.length + 1);
			const withTimeOff = days.toSpliced(index, 0, timeOff);
			expect(accountBalance(withTimeOff, bookings)).toBe(accountBalance(days, bookings) - target);
		}
	);

	test.prop([fc.integer({ min: -100000, max: 100000 }), anyLimit, anyLimit], { numRuns: 1000 })(
		'kept plus forfeited always equals the balance',
		(balance, plusMinutes, minusMinutes) => {
			const { kept, forfeited } = applyCap(
				balance,
				{ plusMinutes, minusMinutes },
				'forfeit_at_close'
			);
			expect(kept + forfeited).toBe(balance);
			expect(kept).toBeLessThanOrEqual(plusMinutes ?? Infinity);
			expect(kept).toBeGreaterThanOrEqual(-(minusMinutes ?? Infinity));
		}
	);

	test.prop(
		[
			fc.integer({ min: -100000, max: 100000 }),
			anyLimit,
			anyLimit,
			fc.constantFrom('warn', 'none')
		],
		{ numRuns: 1000 }
	)('the warn and none modes never cut the balance', (balance, plusMinutes, minusMinutes, mode) => {
		const { kept, forfeited } = applyCap(balance, { plusMinutes, minusMinutes }, mode);
		expect({ kept, forfeited }).toEqual({ kept: balance, forfeited: 0 });
	});
});
