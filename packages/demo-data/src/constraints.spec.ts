import type { VacationEntryType } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { generateDemo } from './index';

// the real inserts run in the api integration tests, this only holds the rows against the checks
const today = Temporal.PlainDate.from('2026-09-24');
const plan = generateDemo({ today, seed: 7 });

const blank = (text: string | null) => text !== null && text.trim() === '';
const instant = (stamp: string) => Temporal.Instant.from(stamp);
const duplicates = (keys: readonly string[]) => keys.filter((key, i) => keys.indexOf(key) !== i);
const overlapping = <Row>(
	rows: readonly Row[],
	from: (row: Row) => number,
	to: (row: Row) => number
) =>
	rows
		.toSorted((a, b) => from(a) - from(b))
		.filter((row, i, sorted) => i > 0 && from(row) < to(sorted[i - 1]!));

describe('generateDemo against the table constraints', () => {
	const employeeIds = new Set(plan.employees.map((employee) => employee.id));
	const userIds = new Set(plan.users.map((user) => user.id));

	it('keeps every reference inside the sandbox', () => {
		const owned = [
			plan.contracts,
			plan.entries,
			plan.corrections,
			plan.absences,
			plan.absenceDays,
			plan.vacationLedger,
			plan.vacationNotices,
			plan.flexBookings,
			plan.findingAcks
		].flat();
		expect(owned.filter((row) => !employeeIds.has(row.employeeId))).toEqual([]);

		const accounts = [
			...plan.teams.flatMap((team) => team.leadUserIds),
			...plan.corrections.flatMap((row) => [row.requestedBy, row.decidedBy]),
			...plan.absences.flatMap((row) => [
				row.requestedBy,
				row.decidedBy,
				row.certificateConfirmedBy
			]),
			...plan.vacationLedger.map((row) => row.createdBy),
			...plan.vacationNotices.map((row) => row.sentBy),
			...plan.flexBookings.map((row) => row.createdBy),
			...plan.monthClosings.map((row) => row.createdBy),
			...plan.findingAcks.map((row) => row.createdBy)
		];
		expect(accounts.filter((id) => id !== null && !userIds.has(id))).toEqual([]);
		expect(
			plan.users.filter((user) => user.employeeId !== null && !employeeIds.has(user.employeeId))
		).toEqual([]);
	});

	it('hands out slug, mail addresses and personnel numbers once', () => {
		expect(plan.tenant.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
		expect(duplicates(plan.users.map((user) => user.email.toLowerCase()))).toEqual([]);
		expect(duplicates(plan.employees.map((employee) => employee.personnelNo))).toEqual([]);
		expect(
			plan.employees.filter(
				(employee) =>
					blank(employee.personnelNo) ||
					blank(employee.firstName) ||
					blank(employee.lastName) ||
					(employee.exitDate !== null && employee.exitDate < employee.entryDate)
			)
		).toEqual([]);
	});

	it('keeps contracts inside the smallint and numeric ranges', () => {
		expect(
			duplicates(plan.contracts.map((contract) => `${contract.employeeId} ${contract.validFrom}`))
		).toEqual([]);
		expect(
			plan.contracts.filter(
				(contract) =>
					Object.values(contract.minutes).some((minutes) => minutes < 0 || minutes > 600) ||
					contract.vacationBasisDays < 1 ||
					contract.vacationBasisDays > 7 ||
					!/^\d{1,3}\.\d$/.test(contract.vacationDaysYear)
			)
		).toEqual([]);
	});

	it('lets no two entries of a person overlap, a running one reaches to the end of time', () => {
		expect(
			plan.entries.filter(
				(entry) =>
					(entry.endedAt !== null &&
						Temporal.Instant.compare(instant(entry.endedAt), instant(entry.startedAt)) <= 0) ||
					(entry.endReason !== null && entry.endedAt === null) ||
					entry.source === 'correction'
			)
		).toEqual([]);
		const running = plan.entries.filter((entry) => entry.endedAt === null);
		expect(duplicates(running.map((entry) => entry.employeeId))).toEqual([]);
		for (const employeeId of employeeIds) {
			const own = plan.entries.filter((entry) => entry.employeeId === employeeId);
			expect(
				overlapping(
					own,
					(entry) => instant(entry.startedAt).epochMilliseconds,
					(entry) => (entry.endedAt ? instant(entry.endedAt).epochMilliseconds : Infinity)
				)
			).toEqual([]);
		}
	});

	it('fills corrections the way their action and status demand', () => {
		const entries = new Map(plan.entries.map((entry) => [entry.id, entry]));
		expect(
			plan.corrections.filter(
				(correction) =>
					correction.reason.trim().length < 10 ||
					(correction.action === 'add') !== (correction.targetEntryId === null) ||
					(correction.action === 'void') !== (correction.newStartedAt === null) ||
					(correction.newStartedAt === null) !== (correction.newEndedAt === null) ||
					(correction.newStartedAt !== null &&
						correction.newEndedAt !== null &&
						Temporal.Instant.compare(
							instant(correction.newEndedAt),
							instant(correction.newStartedAt)
						) <= 0) ||
					['approved', 'rejected'].includes(correction.status) !==
						(correction.decidedBy !== null) ||
					(correction.decidedBy === null) !== (correction.decidedAt === null) ||
					(correction.targetEntryId !== null &&
						entries.get(correction.targetEntryId)?.employeeId !== correction.employeeId)
			)
		).toEqual([]);
	});

	it('lets active requests of a person not overlap, sick notes aside', () => {
		expect(
			plan.absences.filter(
				(absence) =>
					absence.endDate < absence.startDate ||
					(absence.startDate === absence.endDate && absence.halfDayStart && absence.halfDayEnd) ||
					(['approved', 'rejected'].includes(absence.status) &&
						absence.decidedBy === null &&
						absence.type !== 'sick') ||
					(absence.decidedBy === null) !== (absence.decidedAt === null) ||
					(absence.certificateConfirmedAt !== null && absence.type !== 'sick') ||
					(absence.certificateConfirmedAt === null) !== (absence.certificateConfirmedBy === null)
			)
		).toEqual([]);
		const epochDay = (date: string) => Temporal.PlainDate.from(date).since('1970-01-01').days;
		for (const employeeId of employeeIds) {
			const active = plan.absences.filter(
				(absence) =>
					absence.employeeId === employeeId &&
					absence.type !== 'sick' &&
					['pending', 'approved', 'cancel_pending'].includes(absence.status)
			);
			expect(
				overlapping(
					active,
					(absence) => epochDay(absence.startDate),
					(absence) => epochDay(absence.endDate) + 1
				)
			).toEqual([]);
		}
	});

	it('ties absence days to a request of the same person', () => {
		const owners = new Map(plan.absences.map((absence) => [absence.id, absence.employeeId]));
		expect(
			plan.absenceDays.filter(
				(day) =>
					owners.get(day.absenceId) !== day.employeeId ||
					(day.supersededBy !== null && owners.get(day.supersededBy) !== day.employeeId) ||
					(day.supersededBy !== null && day.supersededAt === null) ||
					day.targetMinutes < 0 ||
					day.targetMinutes > 600 ||
					!/^\d{1,2}\.\d{2}$/.test(day.vacationDays)
			)
		).toEqual([]);
	});

	it('books leave with the sign and links its entry type asks for', () => {
		const sign: Partial<Record<VacationEntryType, number>> = {
			entitlement: 1,
			refund_sick: 1,
			refund_cancel: 1,
			taken: -1,
			expiry: -1
		};
		const notices = new Set(plan.vacationNotices.map((notice) => notice.id));
		expect(
			plan.vacationLedger.filter((row) => {
				const days = Number(row.days);
				const wanted = sign[row.entryType];
				return (
					days === 0 ||
					(wanted !== undefined && Math.sign(days) !== wanted) ||
					(['taken', 'refund_sick', 'refund_cancel'].includes(row.entryType) &&
						row.absenceId === null) ||
					(row.entryType === 'expiry' && (row.noticeId === null || !notices.has(row.noticeId))) ||
					(['adjustment', 'manual'].includes(row.entryType) && row.reason === null) ||
					blank(row.reason) ||
					row.bucketYear < 2000 ||
					row.bucketYear > 2100
				);
			})
		).toEqual([]);
		expect(
			duplicates(plan.vacationLedger.flatMap((row) => (row.dedupeKey ? [row.dedupeKey] : [])))
		).toEqual([]);
		expect(
			plan.vacationNotices.filter(
				(notice) => Number(notice.remainingDays) < 0 || blank(notice.textVersion)
			)
		).toEqual([]);
	});

	it('books flextime only with a reason and a cap only with its closing', () => {
		const closings = new Map(plan.monthClosings.map((closing) => [closing.id, closing]));
		expect(
			plan.flexBookings.filter(
				(booking) =>
					!Number.isInteger(booking.minutes) ||
					booking.minutes === 0 ||
					blank(booking.reason) ||
					(booking.type === 'cap_forfeit') !== (booking.monthClosingId !== null) ||
					(booking.monthClosingId !== null && !closings.has(booking.monthClosingId)) ||
					(booking.type === 'payout' && booking.minutes >= 0)
			)
		).toEqual([]);
		expect(
			duplicates(
				plan.flexBookings.flatMap((booking) =>
					booking.monthClosingId ? [`${booking.monthClosingId} ${booking.employeeId}`] : []
				)
			)
		).toEqual([]);
	});

	it('closes month after month on the first day, each one before the running month', () => {
		const months = plan.monthClosings.map((closing) => Temporal.PlainDate.from(closing.month));
		expect(months.filter((month) => month.day !== 1)).toEqual([]);
		months.slice(1).forEach((month, i) => {
			expect(month.equals(months[i]!.add({ months: 1 }))).toBe(true);
		});
		expect(
			months.every((month) => Temporal.PlainDate.compare(month, today.with({ day: 1 })) < 0)
		).toBe(true);
		expect(
			plan.monthClosings.filter(
				(closing) =>
					(closing.action !== 'close' && closing.reason === null) || blank(closing.reason)
			)
		).toEqual([]);
	});

	it('acknowledges a finding once per person, day and rule', () => {
		expect(
			duplicates(plan.findingAcks.map((ack) => `${ack.employeeId} ${ack.workDate} ${ack.ruleCode}`))
		).toEqual([]);
		expect(
			plan.findingAcks.filter(
				(ack) =>
					!/^ARBZG_[0-9A-Z_]+$/.test(ack.ruleCode) || blank(ack.ruleVersion) || blank(ack.note)
			)
		).toEqual([]);
	});
});
