import {
	add,
	allocate,
	annualEntitlement,
	compare,
	expiryDecision,
	fraction,
	negate,
	parseDecimal,
	sickRefund,
	subtract,
	toDecimal,
	type Allocation,
	type Bucket,
	type Fraction,
	type TakenDay
} from '@zeit/rules';
import { Temporal } from 'temporal-polyfill';
import { byStamp, dateOf, eachDay, iso, local, nthBusinessDay, type Calendar } from './calendar';
import type { PlanRow } from './index';
import type { Leave } from './leave';
import type { Random } from './random';
import { officeOf, type Cast } from './staff';

type LedgerRow = PlanRow<'vacationLedger'>;
type NoticeRow = PlanRow<'vacationNotices'>;
type Booking = Pick<LedgerRow, 'bucketYear' | 'entryType' | 'days' | 'effectiveDate'> &
	Partial<Pick<LedgerRow, 'absenceId' | 'noticeId' | 'reason' | 'dedupeKey' | 'createdBy'>>;

const zero = fraction(0);
const NOTICE_TEXT = '2026-09-24';

const deadlineOf = (year: number) => Temporal.PlainDate.from({ year: year + 1, month: 3, day: 31 });

const latestNotice = (notices: readonly NoticeRow[], year: number) =>
	notices
		.filter((notice) => notice.bucketYear === year)
		.toSorted((a, b) => byStamp(a.sentAt, b.sentAt))
		.at(-1);

function judge(
	year: number,
	remaining: Fraction,
	notice: NoticeRow | undefined,
	today: Temporal.PlainDate
) {
	const deadline = deadlineOf(year);
	const told = notice
		? {
				sentAt: Temporal.Instant.from(notice.sentAt),
				deadline: Temporal.PlainDate.from(notice.deadline)
			}
		: null;
	const expiry = expiryDecision({ year, remaining, deadline }, told, today);
	const until =
		told && Temporal.PlainDate.compare(told.deadline, deadline) > 0 ? told.deadline : deadline;
	const payable: Bucket = { year, remaining, deadline: expiry.kind === 'keep' ? null : until };
	return { expiry, payable };
}

function buckets(
	ledger: readonly LedgerRow[],
	notices: readonly NoticeRow[],
	today: Temporal.PlainDate
) {
	const years = [...new Set(ledger.map((entry) => entry.bucketYear))].sort((a, b) => a - b);
	return years.map((year) => {
		const remaining = ledger
			.filter((entry) => entry.bucketYear === year)
			.reduce((sum, entry) => add(sum, parseDecimal(entry.days)), zero);
		const notice = latestNotice(notices, year);
		return { year, remaining, notice, ...judge(year, remaining, notice, today) };
	});
}

function perYear(allocations: readonly Allocation[]): Map<number, Fraction> {
	const years = new Map<number, Fraction>();
	for (const allocation of allocations) {
		years.set(allocation.year, add(years.get(allocation.year) ?? zero, allocation.days));
	}
	return years;
}

function charge(days: readonly TakenDay[], payable: readonly Bucket[]): Map<number, Fraction> {
	const { allocations } = allocate(days, payable);
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

function heldPerYear(own: readonly LedgerRow[]): Map<number, Fraction> {
	const held = new Map<number, Fraction>();
	for (const entry of own) {
		held.set(
			entry.bucketYear,
			subtract(held.get(entry.bucketYear) ?? zero, parseDecimal(entry.days))
		);
	}
	return held;
}

export function bookVacation(
	rng: Random,
	cast: Cast,
	calendar: Calendar,
	leaves: readonly Leave[],
	days: readonly PlanRow<'absenceDays'>[]
): { ledger: LedgerRow[]; notices: NoticeRow[] } {
	const { year, today } = calendar;
	const allLedger: LedgerRow[] = [];
	const allNotices: NoticeRow[] = [];
	const takenOf = (absenceId: string): TakenDay[] =>
		days
			.filter((day) => day.absenceId === absenceId)
			.map((day) => ({
				date: Temporal.PlainDate.from(day.date),
				vacationDays: parseDecimal(day.vacationDays)
			}));

	for (const person of cast.people) {
		const employeeId = person.employee.id;
		const { entryDate, exitDate } = person.employment;
		const ledger: LedgerRow[] = [];
		const notices: NoticeRow[] = [];
		const events: { at: Temporal.Instant; run: (at: Temporal.Instant) => void }[] = [];
		const when = (at: Temporal.Instant, run: (at: Temporal.Instant) => void) => {
			events.push({ at, run });
		};
		const book = (at: Temporal.Instant, booking: Booking) => {
			ledger.push({
				id: rng.uuid(),
				employeeId,
				absenceId: null,
				noticeId: null,
				reason: null,
				dedupeKey: null,
				createdBy: null,
				...booking,
				createdAt: iso(at)
			});
		};
		const notify = (
			at: Temporal.Instant,
			notice: Omit<NoticeRow, 'id' | 'employeeId' | 'sentAt'>
		) => {
			notices.push({ id: rng.uuid(), employeeId, ...notice, sentAt: iso(at) });
		};

		if (person.carryover) {
			const carryover = person.carryover;
			when(local(Temporal.PlainDate.from({ year, month: 1, day: 2 }), 510), (at) =>
				book(at, {
					bucketYear: year - 1,
					entryType: 'manual',
					days: carryover,
					effectiveDate: `${year - 1}-12-31`,
					reason: 'Resturlaub aus dem Vorsystem übernommen',
					createdBy: officeOf(cast, person).id
				})
			);
			if (person === cast.noticed) {
				const sent = Temporal.PlainDate.from({ year: year - 1, month: 10, day: 14 });
				when(local(sent, rng.int(540, 660)), (at) =>
					notify(at, {
						bucketYear: year - 1,
						remainingDays: carryover,
						deadline: deadlineOf(year - 1).toString(),
						sentBy: cast.hr.user.id,
						channel: 'letter',
						textVersion: 'brief-v1'
					})
				);
			}
		}

		for (let inYear = year; inYear <= today.year; inYear++) {
			const newYear = Temporal.PlainDate.from({ year: inYear, month: 1, day: 1 });
			if (exitDate && Temporal.PlainDate.compare(exitDate, newYear) < 0) continue;
			if (Temporal.PlainDate.compare(entryDate, newYear) <= 0) {
				when(local(newYear, 5), (at) => {
					const { rounded } = annualEntitlement(person.employment, inYear, newYear);
					if (compare(rounded, zero) <= 0) return;
					book(at, {
						bucketYear: inYear,
						entryType: 'entitlement',
						days: toDecimal(rounded, 2),
						effectiveDate: newYear.toString(),
						dedupeKey: `vacation-entitlement:${employeeId}:${inYear}`
					});
				});
			} else if (entryDate.year === inYear) {
				when(local(entryDate, 540), (at) =>
					book(at, {
						bucketYear: inYear,
						entryType: 'entitlement',
						days: toDecimal(annualEntitlement(person.employment, inYear, entryDate).rounded, 2),
						effectiveDate: entryDate.toString(),
						createdBy: officeOf(cast, person).id
					})
				);
			}

			const sent = nthBusinessDay(
				calendar,
				Temporal.PlainYearMonth.from({ year: inYear, month: 10 }),
				10
			);
			if (Temporal.PlainDate.compare(sent, today) < 0) {
				when(local(sent, rng.int(600, 630)), (at) => {
					const bucket = buckets(ledger, notices, sent).find((each) => each.year === inYear);
					if (!bucket || compare(bucket.remaining, zero) <= 0) return;
					notify(at, {
						bucketYear: inYear,
						remainingDays: toDecimal(bucket.remaining, 2),
						deadline: deadlineOf(inYear).toString(),
						sentBy: cast.hr.user.id,
						channel: 'in_app',
						textVersion: NOTICE_TEXT
					});
				});
			}

			const due = Temporal.PlainDate.from({ year: inYear, month: 4, day: 1 });
			if (Temporal.PlainDate.compare(due, today) <= 0) {
				when(local(due, 120), (at) => {
					for (const bucket of buckets(ledger, notices, due)) {
						if (bucket.expiry.kind !== 'forfeit' || compare(bucket.remaining, zero) <= 0) continue;
						book(at, {
							bucketYear: bucket.year,
							entryType: 'expiry',
							days: toDecimal(negate(bucket.remaining), 2),
							effectiveDate: bucket.payable.deadline!.toString(),
							noticeId: bucket.notice!.id,
							dedupeKey: `vacation-expiry:${employeeId}:${bucket.year}`
						});
					}
				});
			}
		}

		const own = leaves.filter((leave) => leave.person === person);
		for (const leave of own) {
			const { row } = leave;
			if (row.type === 'vacation' && leave.approvedAt) {
				when(leave.approvedAt, (at) => {
					const approvedOn = dateOf(at);
					const payable = buckets(ledger, notices, approvedOn).map((bucket) => bucket.payable);
					for (const [bucketYear, drawn] of charge(takenOf(row.id), payable)) {
						book(at, {
							bucketYear,
							entryType: 'taken',
							days: toDecimal(negate(drawn), 2),
							effectiveDate: approvedOn.toString(),
							absenceId: row.id,
							createdBy: row.decidedBy
						});
					}
				});
			}
			if (row.status === 'cancelled' && row.decidedAt) {
				when(Temporal.Instant.from(row.decidedAt), (at) => {
					const held = heldPerYear(ledger.filter((entry) => entry.absenceId === row.id));
					for (const [bucketYear, days] of held) {
						if (compare(days, zero) <= 0) continue;
						book(at, {
							bucketYear,
							entryType: 'refund_cancel',
							days: toDecimal(days, 2),
							effectiveDate: dateOf(at).toString(),
							absenceId: row.id,
							createdBy: row.decidedBy
						});
					}
				});
			}
		}

		for (const { row: sick } of own) {
			if (sick.type !== 'sick' || !sick.certificateConfirmedAt) continue;
			const sickDates = eachDay(
				Temporal.PlainDate.from(sick.startDate),
				Temporal.PlainDate.from(sick.endDate)
			);
			const beneath = own.filter(
				({ row }) =>
					row.type === 'vacation' &&
					row.status === 'approved' &&
					row.startDate <= sick.endDate &&
					sick.startDate <= row.endDate
			);
			for (const { row: trip } of beneath) {
				when(Temporal.Instant.from(sick.certificateConfirmedAt), (at) => {
					const taken = takenOf(trip.id);
					const refund = sickRefund(taken, sickDates);
					const back = new Set(refund.dates.map((date) => date.toString()));
					const paid = ledger.filter((entry) => entry.absenceId === trip.id);
					const approval = paid.find((entry) => entry.entryType === 'taken')!;
					const approvedAt = Temporal.Instant.from(approval.createdAt);
					const told = notices.filter(
						(notice) =>
							Temporal.Instant.compare(Temporal.Instant.from(notice.sentAt), approvedAt) < 0
					);
					const held = [...heldPerYear(paid)]
						.sort(([a], [b]) => a - b)
						.map(
							([bucketYear, days]) =>
								judge(
									bucketYear,
									days,
									latestNotice(told, bucketYear),
									Temporal.PlainDate.from(approval.effectiveDate)
								).payable
						);
					const split = allocate(taken, held).allocations.filter((allocation) =>
						back.has(allocation.date.toString())
					);
					for (const [bucketYear, days] of perYear(split)) {
						book(at, {
							bucketYear,
							entryType: 'refund_sick',
							days: toDecimal(days, 2),
							effectiveDate: dateOf(at).toString(),
							absenceId: trip.id,
							createdBy: sick.certificateConfirmedBy
						});
					}
				});
			}
		}

		events.sort((a, b) => Temporal.Instant.compare(a.at, b.at));
		for (const event of events) event.run(event.at);
		allLedger.push(...ledger);
		allNotices.push(...notices);
	}

	return {
		ledger: allLedger.sort((a, b) => byStamp(a.createdAt, b.createdAt)),
		notices: allNotices.sort((a, b) => byStamp(a.sentAt, b.sentAt))
	};
}
