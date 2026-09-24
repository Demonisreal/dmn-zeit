import { fraction, toDecimal, type TakenDay } from '@zeit/rules';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
	berlinToday,
	bucketsOf,
	charge,
	heldPerYear,
	latestNotice,
	paidBy,
	usableDays,
	type LedgerEntry,
	type NoticeRow
} from './buckets';

const date = (text: string) => Temporal.PlainDate.from(text);

let serial = 0;
function entry(
	bucketYear: number,
	entryType: LedgerEntry['entryType'],
	days: string,
	extra: Partial<LedgerEntry> = {}
): LedgerEntry {
	return {
		id: `entry-${++serial}`,
		bucketYear,
		entryType,
		days,
		effectiveDate: `${bucketYear}-01-01`,
		absenceId: null,
		noticeId: null,
		reason: null,
		createdAt: '2026-01-01T00:05:00Z',
		...extra
	};
}

function notice(
	bucketYear: number,
	sentAt: string,
	deadline = `${bucketYear + 1}-03-31`
): NoticeRow {
	return { id: `notice-${sentAt}`, bucketYear, sentAt, deadline, acknowledgedAt: null };
}

const days = (...dates: string[]): TakenDay[] =>
	dates.map((text) => ({ date: date(text), vacationDays: fraction(1) }));

const decimals = (map: Map<number, { num: number; den: number }>) =>
	Object.fromEntries([...map].map(([year, days]) => [year, toDecimal(days, 2)]));

describe('bucketsOf', () => {
	it('sums every entry type into its column and keeps the rest exact', () => {
		const [bucket] = bucketsOf(
			[
				entry(2026, 'entitlement', '10.42'),
				entry(2026, 'taken', '-2.50'),
				entry(2026, 'refund_sick', '0.50'),
				entry(2026, 'adjustment', '-1.00'),
				entry(2026, 'manual', '0.25')
			],
			[],
			'03-31',
			date('2026-09-24')
		);

		expect(toDecimal(bucket!.entitlement, 2)).toBe('10.42');
		expect(toDecimal(bucket!.taken, 2)).toBe('2.50');
		expect(toDecimal(bucket!.refunded, 2)).toBe('0.50');
		expect(toDecimal(bucket!.adjusted, 2)).toBe('-0.75');
		expect(toDecimal(bucket!.remaining, 2)).toBe('7.67');
		expect(bucket!.deadline.toString()).toBe('2027-03-31');
		expect(bucket!.expiry.kind).toBe('not_due');
	});

	it('keeps a bucket past its deadline without a notice and lets allocate use it without end', () => {
		const [bucket] = bucketsOf(
			[entry(2025, 'entitlement', '4.00')],
			[],
			'03-31',
			date('2026-04-01')
		);

		expect(bucket!.expiry.kind).toBe('keep');
		expect(bucket!.expiry.explanation.key).toBe('vacation.expiry.no_notice');
		expect(bucket!.payable.deadline).toBeNull();
		expect(toDecimal(usableDays([bucket!]), 2)).toBe('4.00');
	});

	it('forfeits after the deadline once a notice went out, and no longer counts the days', () => {
		const [bucket] = bucketsOf(
			[entry(2025, 'entitlement', '4.00')],
			[notice(2025, '2025-10-01T08:00:00Z')],
			'03-31',
			date('2026-04-01')
		);

		expect(bucket!.expiry.kind).toBe('forfeit');
		expect(bucket!.payable.deadline?.toString()).toBe('2026-03-31');
		expect(toDecimal(usableDays([bucket!]), 2)).toBe('0.00');
	});

	it('still counts the deadline day itself as usable', () => {
		const [bucket] = bucketsOf(
			[entry(2025, 'entitlement', '4.00')],
			[notice(2025, '2025-10-01T08:00:00Z')],
			'03-31',
			date('2026-03-31')
		);
		expect(bucket!.expiry.kind).toBe('not_due');
	});
});

describe('latestNotice', () => {
	it('compares stamps as instants, pg leaves the microseconds ragged', () => {
		const early = notice(2025, '2025-10-01T08:00:00.5Z');
		const late = notice(2025, '2025-10-01T08:00:00.500001Z');
		expect(latestNotice([late, early], 2025)).toBe(late);
		expect(latestNotice([early, late], 2025)).toBe(late);
		expect(latestNotice([early], 2024)).toBeNull();
	});
});

describe('berlinToday', () => {
	it('turns the new day at midnight in Berlin, not in UTC', () => {
		expect(berlinToday(new Date('2026-12-31T23:30:00Z')).toString()).toBe('2027-01-01');
		expect(berlinToday(new Date('2026-06-30T21:59:00Z')).toString()).toBe('2026-06-30');
	});
});

describe('charge', () => {
	const buckets = (left2025: string, left2026: string) =>
		bucketsOf(
			[entry(2025, 'entitlement', left2025), entry(2026, 'entitlement', left2026)],
			[],
			'03-31',
			date('2026-03-01')
		).map((bucket) => bucket.payable);

	it('pays the carry-over first and switches buckets once its deadline passed', () => {
		const costs = charge(days('2026-03-30', '2026-03-31', '2026-04-01'), buckets('5.00', '30.00'));
		expect(decimals(costs)).toEqual({ 2025: '2.00', 2026: '1.00' });
	});

	it('splits a day across two buckets to the half', () => {
		const costs = charge(days('2026-03-02', '2026-03-03'), buckets('1.50', '30.00'));
		expect(decimals(costs)).toEqual({ 2025: '1.50', 2026: '0.50' });
	});

	it('books what no bucket covers against the year of the day', () => {
		const costs = charge(days('2026-03-30', '2027-01-04'), buckets('0.00', '1.00'));
		expect(decimals(costs)).toEqual({ 2026: '1.00', 2027: '1.00' });
	});
});

describe('heldPerYear and paidBy', () => {
	const own = [
		entry(2025, 'taken', '-2.00', { absenceId: 'a', createdAt: '2026-03-20T09:00:00Z' }),
		entry(2026, 'taken', '-2.00', { absenceId: 'a', createdAt: '2026-03-20T09:00:00Z' })
	];
	const vacation = days('2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02');

	it('holds taken minus what was given back', () => {
		const held = heldPerYear([...own, entry(2025, 'refund_sick', '1.00', { absenceId: 'a' })]);
		expect(decimals(held)).toEqual({ 2025: '1.00', 2026: '2.00' });
	});

	it('replays the split of the approval day even after the carry-over deadline', () => {
		// on 20 March the 2025 bucket still had its deadline, today it would count as kept
		const split = paidBy(vacation, own, [], '03-31', date('2026-03-20'));
		expect(split.map((allocation) => [allocation.date.toString(), allocation.year])).toEqual([
			['2026-03-30', 2025],
			['2026-03-31', 2025],
			['2026-04-01', 2026],
			['2026-04-02', 2026]
		]);
	});

	it('finds the right bucket for the days left after a refund', () => {
		const afterRefund = [...own, entry(2025, 'refund_sick', '1.00', { absenceId: 'a' })];
		const split = paidBy(
			days('2026-03-30', '2026-04-01', '2026-04-02'),
			afterRefund,
			[],
			'03-31',
			date('2026-03-20')
		);
		expect(split.map((allocation) => allocation.year)).toEqual([2025, 2026, 2026]);
	});
});
