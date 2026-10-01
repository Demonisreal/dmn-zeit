import {
	accountBalance,
	checkShifts,
	dayBalance,
	groupShifts,
	holidaysFor,
	parseDecimal,
	summarizeWorkday,
	targetMinutes,
	type DayMinutes,
	type Employment,
	type Finding,
	type Holiday
} from '@zeit/rules';
import type { Clock, Day, FlexBooking, FlexMonth, Totals } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import type {
	AbsenceDayRow,
	AckRow,
	DateRange,
	EntryRow,
	Sheet,
	TenantSettings
} from './time.store';

export const TIME_ZONE = 'Europe/Berlin';

export const localDate = (now: Date): string =>
	Temporal.Instant.fromEpochMilliseconds(now.getTime())
		.toZonedDateTimeISO(TIME_ZONE)
		.toPlainDate()
		.toString();

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const row of rows) {
		const group = groups.get(key(row));
		if (group) group.push(row);
		else groups.set(key(row), [row]);
	}
	return groups;
}

const spanOf = (entry: EntryRow) => ({
	start: Temporal.Instant.from(entry.startedAt),
	end: entry.endedAt === null ? null : Temporal.Instant.from(entry.endedAt)
});

function employmentOf(sheet: Sheet): Employment {
	const { entryDate, exitDate } = sheet.employee;
	return {
		entryDate: Temporal.PlainDate.from(entryDate),
		exitDate: exitDate === null ? null : Temporal.PlainDate.from(exitDate),
		contracts: sheet.contracts.map((contract) => ({
			validFrom: Temporal.PlainDate.from(contract.validFrom),
			minutes: contract.minutes,
			vacationDaysYear: parseDecimal(contract.vacationDaysYear),
			vacationBasisDays: contract.vacationBasisDays,
			capOverride: contract.flexCap
		}))
	};
}

function holidaysByDate(tenant: TenantSettings, from: Temporal.PlainDate, to: Temporal.PlainDate) {
	const byDate = new Map<string, Holiday>();
	const all: Holiday[] = [];
	for (let year = from.year; year <= to.year; year++) {
		all.push(
			...holidaysFor(year, tenant.state, {
				optional: tenant.holidayOptions,
				halfDays: tenant.halfDays
			})
		);
	}
	for (const holiday of all) {
		const date = holiday.date.toString();
		if (!byDate.has(date) || holiday.portion === 1) byDate.set(date, holiday);
	}
	return { all, byDate };
}

function credits(absence: AbsenceDayRow): boolean {
	return (
		(absence.type === 'vacation' || absence.type === 'sick') &&
		(absence.status === 'approved' || absence.status === 'cancel_pending')
	);
}

function findingOf(finding: Finding, ack: AckRow | undefined): Day['findings'][number] {
	return {
		code: finding.code,
		severity: finding.severity,
		ruleVersion: finding.ruleVersion,
		facts: { ...finding.facts },
		explanation: { key: `finding.${finding.code.toLowerCase()}`, params: { ...finding.facts } },
		ack: ack ? { at: ack.at, by: ack.by, note: ack.note } : null
	};
}

export function buildDays(
	sheet: Sheet,
	tenant: TenantSettings,
	range: DateRange,
	now: Date
): Day[] {
	const instant = Temporal.Instant.fromEpochMilliseconds(now.getTime());
	const from = Temporal.PlainDate.from(range.from);
	const to = Temporal.PlainDate.from(range.to);
	const employment = employmentOf(sheet);
	const holidays = holidaysByDate(tenant, from, to);
	const { closedThrough } = sheet.employee;

	const shifts = groupShifts(
		sheet.entries.map((entry) => {
			const span = spanOf(entry);
			return { start: span.start, end: span.end ?? instant };
		}),
		TIME_ZONE
	);
	const findings = groupBy(
		checkShifts(shifts, { timeZone: TIME_ZONE, holidays: holidays.all, range: { from, to } }),
		(finding) => finding.date.toString()
	);
	const entries = groupBy(sheet.entries, (entry) => entry.workday);
	const absences = new Map(sheet.absences.map((absence) => [absence.date, absence]));
	const acks = new Map(sheet.acks.map((ack) => [`${ack.date} ${ack.code}`, ack]));

	const days: Day[] = [];
	for (let date = from; Temporal.PlainDate.compare(date, to) <= 0; date = date.add({ days: 1 })) {
		const iso = date.toString();
		const holiday = holidays.byDate.get(iso) ?? null;
		const target = targetMinutes(employment, date, holiday);
		const ofDay = entries.get(iso) ?? [];
		const summary = summarizeWorkday(ofDay.map(spanOf), instant, TIME_ZONE);
		const absence = absences.get(iso);
		const creditedMinutes =
			absence && credits(absence) ? Math.round(target.minutes * absence.portion) : 0;

		days.push({
			date: iso,
			target,
			workedMinutes: summary.workedMinutes,
			creditedMinutes,
			diffMinutes: dayBalance({
				targetMinutes: target.minutes,
				workedMinutes: summary.workedMinutes,
				creditedMinutes
			}),
			breakMinutes: summary.breakMinutes,
			running: summary.running,
			entries: ofDay.map(({ id, startedAt, endedAt, endReason, source }) => ({
				id,
				startedAt,
				endedAt,
				endReason,
				source
			})),
			holiday: holiday && { code: holiday.code, portion: holiday.portion },
			absence: absence
				? {
						requestId: absence.requestId,
						type: absence.type,
						status: absence.status,
						portion: absence.portion
					}
				: null,
			findings: (findings.get(iso) ?? []).map((finding) =>
				findingOf(finding, acks.get(`${iso} ${finding.code}`))
			),
			locked: closedThrough !== null && iso <= closedThrough
		});
	}
	return days;
}

const minutesOf = (day: Day): DayMinutes => ({
	targetMinutes: day.target.minutes,
	workedMinutes: day.workedMinutes,
	creditedMinutes: day.creditedMinutes
});

export function totalsOf(days: readonly Day[]): Totals {
	const totals: Totals = { targetMinutes: 0, workedMinutes: 0, creditedMinutes: 0, diffMinutes: 0 };
	for (const day of days) {
		totals.targetMinutes += day.target.minutes;
		totals.workedMinutes += day.workedMinutes;
		totals.creditedMinutes += day.creditedMinutes;
		totals.diffMinutes += day.diffMinutes;
	}
	return totals;
}

export function summarizeFlex(
	days: readonly Day[],
	bookings: readonly FlexBooking[],
	closedThrough: string | null
): { openingMinutes: number; balanceMinutes: number; months: FlexMonth[] } {
	const openingMinutes = bookings
		.filter((booking) => booking.type === 'opening')
		.reduce((sum, booking) => sum + booking.minutes, 0);
	const booked = groupBy(
		bookings.filter((booking) => booking.type !== 'opening'),
		(booking) => booking.effectiveDate.slice(0, 7)
	);

	const months: FlexMonth[] = [];
	let balance = openingMinutes;
	for (const [month, ofMonth] of groupBy(days, (day) => day.date.slice(0, 7))) {
		const totals = totalsOf(ofMonth);
		const bookedMinutes = (booked.get(month) ?? []).reduce(
			(sum, booking) => sum + booking.minutes,
			0
		);
		balance += totals.diffMinutes + bookedMinutes;
		months.push({
			month,
			targetMinutes: totals.targetMinutes,
			workedMinutes: totals.workedMinutes,
			creditedMinutes: totals.creditedMinutes,
			bookedMinutes,
			diffMinutes: totals.diffMinutes,
			balanceMinutes: balance,
			closed: closedThrough !== null && ofMonth.at(-1)!.date <= closedThrough
		});
	}
	return { openingMinutes, balanceMinutes: accountBalance(days.map(minutesOf), bookings), months };
}

export function clockState(entries: readonly EntryRow[], today: string, now: Date): Clock {
	const running = entries.find((entry) => entry.endedAt === null);
	const workday = running?.workday ?? today;
	const ofDay = entries.filter((entry) => entry.workday === workday);
	const { workedMinutes } = summarizeWorkday(
		ofDay.map(spanOf),
		Temporal.Instant.fromEpochMilliseconds(now.getTime()),
		TIME_ZONE
	);

	if (running) {
		return {
			state: 'working',
			workday,
			workedMinutes,
			entryId: running.id,
			since: running.startedAt
		};
	}
	const last = ofDay.at(-1);
	if (last?.endReason === 'break' && last.endedAt) {
		return { state: 'on_break', workday, workedMinutes, since: last.endedAt };
	}
	return { state: 'off', workday, workedMinutes };
}
