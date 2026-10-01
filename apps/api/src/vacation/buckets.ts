import {
	add,
	allocate,
	compare,
	expiryDecision,
	fraction,
	negate,
	parseDecimal,
	subtract,
	type Allocation,
	type Bucket,
	type Expiry,
	type Fraction,
	type TakenDay
} from '@zeit/rules';
import type { VacationEntryType } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';

export type LedgerEntry = {
	id: string;
	bucketYear: number;
	entryType: VacationEntryType;
	days: string;
	effectiveDate: string;
	absenceId: string | null;
	noticeId: string | null;
	reason: string | null;
	createdAt: string;
};

export type NoticeRow = {
	id: string;
	bucketYear: number;
	sentAt: string;
	deadline: string;
	acknowledgedAt: string | null;
};

export type BucketState = {
	year: number;
	entitlement: Fraction;
	taken: Fraction;
	refunded: Fraction;
	adjusted: Fraction;
	expired: Fraction;
	remaining: Fraction;
	deadline: Temporal.PlainDate;
	notice: NoticeRow | null;
	expiry: Expiry;
	payable: Bucket;
};

const zero = fraction(0);

export function berlinToday(now: Date): Temporal.PlainDate {
	return Temporal.Instant.fromEpochMilliseconds(now.getTime())
		.toZonedDateTimeISO('Europe/Berlin')
		.toPlainDate();
}

export function deadlineOf(year: number, carryoverUntil: string): Temporal.PlainDate {
	return Temporal.PlainDate.from(`${year + 1}-${carryoverUntil}`);
}

export function instantOf(stamp: string): Temporal.Instant {
	return Temporal.Instant.from(stamp);
}

export function latestNotice(notices: readonly NoticeRow[], year: number): NoticeRow | null {
	let latest: NoticeRow | null = null;
	for (const notice of notices) {
		if (
			notice.bucketYear === year &&
			(!latest || Temporal.Instant.compare(instantOf(notice.sentAt), instantOf(latest.sentAt)) > 0)
		) {
			latest = notice;
		}
	}
	return latest;
}

function judge(
	year: number,
	remaining: Fraction,
	notice: NoticeRow | null,
	carryoverUntil: string,
	today: Temporal.PlainDate
) {
	const deadline = deadlineOf(year, carryoverUntil);
	const told = notice && {
		sentAt: instantOf(notice.sentAt),
		deadline: Temporal.PlainDate.from(notice.deadline)
	};
	const expiry = expiryDecision({ year, remaining, deadline }, told, today);
	const until =
		told && Temporal.PlainDate.compare(told.deadline, deadline) > 0 ? told.deadline : deadline;
	const payable: Bucket = { year, remaining, deadline: expiry.kind === 'keep' ? null : until };
	return { deadline, expiry, payable };
}

function total(entries: readonly LedgerEntry[], types: readonly VacationEntryType[]): Fraction {
	return entries
		.filter((entry) => types.includes(entry.entryType))
		.reduce((sum, entry) => add(sum, parseDecimal(entry.days)), zero);
}

export function bucketsOf(
	entries: readonly LedgerEntry[],
	notices: readonly NoticeRow[],
	carryoverUntil: string,
	today: Temporal.PlainDate
): BucketState[] {
	const years = [...new Set(entries.map((entry) => entry.bucketYear))].sort((a, b) => a - b);
	return years.map((year) => {
		const own = entries.filter((entry) => entry.bucketYear === year);
		const remaining = own.reduce((sum, entry) => add(sum, parseDecimal(entry.days)), zero);
		const notice = latestNotice(notices, year);
		return {
			year,
			entitlement: total(own, ['entitlement']),
			taken: negate(total(own, ['taken'])),
			refunded: total(own, ['refund_sick', 'refund_cancel']),
			adjusted: total(own, ['adjustment', 'manual']),
			expired: negate(total(own, ['expiry'])),
			remaining,
			notice,
			...judge(year, remaining, notice, carryoverUntil, today)
		};
	});
}

export function usableDays(buckets: readonly BucketState[]): Fraction {
	return buckets
		.filter((bucket) => bucket.expiry.kind !== 'forfeit')
		.reduce((sum, bucket) => add(sum, bucket.remaining), zero);
}

export function heldPerYear(own: readonly LedgerEntry[]): Map<number, Fraction> {
	const held = new Map<number, Fraction>();
	for (const entry of own) {
		held.set(
			entry.bucketYear,
			subtract(held.get(entry.bucketYear) ?? zero, parseDecimal(entry.days))
		);
	}
	return held;
}

export function perYear(allocations: readonly Allocation[]): Map<number, Fraction> {
	const years = new Map<number, Fraction>();
	for (const allocation of allocations) {
		years.set(allocation.year, add(years.get(allocation.year) ?? zero, allocation.days));
	}
	return years;
}

export function charge(
	days: readonly TakenDay[],
	buckets: readonly Bucket[]
): Map<number, Fraction> {
	const { allocations } = allocate(days, buckets);
	const years = perYear(allocations);
	for (const day of days) {
		const paid = allocations
			.filter((allocation) => allocation.date.equals(day.date))
			.reduce((sum, allocation) => add(sum, allocation.days), zero);
		const missing = subtract(day.vacationDays, paid);
		if (compare(missing, zero) > 0) {
			years.set(day.date.year, add(years.get(day.date.year) ?? zero, missing));
		}
	}
	return years;
}

export function paidBy(
	days: readonly TakenDay[],
	own: readonly LedgerEntry[],
	notices: readonly NoticeRow[],
	carryoverUntil: string,
	approvedOn: Temporal.PlainDate
): Allocation[] {
	const buckets = [...heldPerYear(own)]
		.sort(([a], [b]) => a - b)
		.map(
			([year, held]) =>
				judge(year, held, latestNotice(notices, year), carryoverUntil, approvedOn).payable
		);
	return allocate(days, buckets).allocations;
}
