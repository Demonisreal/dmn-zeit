import { daysForRange, toDecimal, type DayCost } from '@zeit/rules';
import type { AbsenceStatus, AbsenceType } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import {
	dateOf,
	eachDay,
	endOfMonth,
	iso,
	local,
	nextBusinessDay,
	targetOn,
	weekdayFrom,
	type Calendar
} from './calendar';
import type { PlanRow } from './index';
import type { Random } from './random';
import type { Special } from './shifts';
import { leadOf, officeOf, type Cast, type Person } from './staff';

export type Leave = {
	person: Person;
	row: PlanRow<'absences'>;
	// kept apart for a cancelled request, the row only holds the last decision
	approvedAt: Temporal.Instant | null;
};

type Worked = DayCost & { portion: 0.5 | 1 };

const ACTIVE: readonly AbsenceStatus[] = ['pending', 'approved', 'cancel_pending'];

export const isAway = (leaves: readonly Leave[], person: Person, date: Temporal.PlainDate) => {
	const day = date.toString();
	return leaves.some(
		({ person: owner, row }) =>
			owner === person && ACTIVE.includes(row.status) && row.startDate <= day && day <= row.endDate
	);
};

function office(rng: Random, cast: Cast, calendar: Calendar, leaves: Leave[]) {
	const at = (date: Temporal.PlainDate, from = 480, to = 1020) => local(date, rng.int(from, to));
	const ask = (
		person: Person,
		type: AbsenceType,
		start: Temporal.PlainDate,
		end: Temporal.PlainDate,
		createdAt: Temporal.Instant
	): Leave => {
		const leave: Leave = {
			person,
			approvedAt: null,
			row: {
				id: rng.uuid(),
				employeeId: person.employee.id,
				type,
				startDate: start.toString(),
				endDate: end.toString(),
				halfDayStart: false,
				halfDayEnd: false,
				status: type === 'sick' ? 'approved' : 'pending',
				requestedBy: person.user.id,
				decidedBy: null,
				decidedAt: null,
				decisionNote: null,
				certificateConfirmedAt: null,
				certificateConfirmedBy: null,
				createdAt: iso(createdAt)
			}
		};
		leaves.push(leave);
		return leave;
	};
	const approve = (leave: Leave, decidedAt: Temporal.Instant) => {
		leave.row.status = 'approved';
		leave.row.decidedBy = leadOf(cast, leave.person).id;
		leave.row.decidedAt = iso(decidedAt);
		leave.approvedAt = decidedAt;
	};
	const confirm = (sick: Leave) => {
		const end = Temporal.PlainDate.from(sick.row.endDate);
		sick.row.certificateConfirmedAt = iso(at(nextBusinessDay(calendar, end), 540, 660));
		sick.row.certificateConfirmedBy = officeOf(cast, sick.person).id;
	};
	return { at, ask, approve, confirm };
}

export function planLeave(
	rng: Random,
	cast: Cast,
	calendar: Calendar,
	specials: readonly Special[]
): Leave[] {
	const leaves: Leave[] = [];
	const { at, ask, approve, confirm } = office(rng, cast, calendar, leaves);
	const { year } = calendar;
	const on = (month: number, day: number, inYear = year) =>
		Temporal.PlainDate.from({ year: inYear, month, day });
	const vacation = (person: Person, start: Temporal.PlainDate, end: Temporal.PlainDate) => {
		const earliest = local(on(1, 5), 540);
		const wanted = at(start.subtract({ days: rng.int(21, 45) }));
		const asked = Temporal.Instant.compare(wanted, earliest) > 0 ? wanted : earliest;
		const leave = ask(person, 'vacation', start, end, asked);
		approve(leave, at(dateOf(asked).add({ days: rng.int(1, 3) })));
		return leave;
	};
	// a day before and after a scene stays clear, a night shift should not end in someone's vacation
	const blocked = (person: Person, start: Temporal.PlainDate, end: Temporal.PlainDate) => {
		const from = start.subtract({ days: 1 }).toString();
		const to = end.add({ days: 1 }).toString();
		return (
			specials.some(
				(special) =>
					special.person === person &&
					from <= special.date.toString() &&
					special.date.toString() <= to
			) ||
			leaves.some(
				({ person: owner, row }) =>
					owner === person && row.startDate <= end.toString() && start.toString() <= row.endDate
			)
		);
	};

	// last year's rest goes first; the lead's four days reach into this year's bucket
	const leadWeek = weekdayFrom(on(2, 23), 1);
	vacation(cast.lead, leadWeek, leadWeek.add({ days: 3 }));
	const payrollWeek = weekdayFrom(on(3, 2), 1);
	vacation(cast.payrollLead, payrollWeek.add({ days: 2 }), payrollWeek.add({ days: 4 }));
	const noticedWeek = weekdayFrom(on(2, 9), 1);
	vacation(cast.noticed, noticedWeek.add({ days: 3 }), noticedWeek.add({ days: 4 }));

	// sick in the second week of a two-week vacation, the certificate gives the days back
	const trip = weekdayFrom(on(5, 11), 1);
	vacation(cast.payrollLead, trip, trip.add({ days: 11 }));
	const fever = trip.add({ days: 9 });
	confirm(ask(cast.payrollLead, 'sick', fever, fever.add({ days: 2 }), at(fever, 440, 480)));

	const june = weekdayFrom(on(6, 8), 1);
	const cancelled = ask(cast.busy, 'vacation', june, june.add({ days: 4 }), at(on(3, 10)));
	approve(cancelled, at(on(3, 12)));
	cancelled.row.status = 'cancelled';
	cancelled.row.decidedAt = iso(at(nextBusinessDay(calendar, on(5, 17))));

	for (let inYear = year; inYear <= calendar.today.year; inYear++) {
		for (const person of cast.people) {
			const { entryDate, exitDate } = person.employment;
			const windows = [
				{ from: on(1, 12, inYear), to: on(3, 20, inYear), days: inYear > year ? 5 : 0 },
				{ from: on(4, 7, inYear), to: on(5, 29, inYear), days: rng.int(3, 5) },
				{ from: on(6, 1, inYear), to: on(8, 28, inYear), days: 10 },
				{ from: on(10, 5, inYear), to: on(10, 30, inYear), days: 5 }
			];
			if (person === cast.newcomer && inYear === year) {
				windows.splice(0, windows.length, { from: on(6, 1), to: on(8, 28), days: 5 });
			}
			for (const window of windows.filter((candidate) => candidate.days > 0)) {
				const mondays = eachDay(window.from, window.to).filter((date) => date.dayOfWeek === 1);
				for (const monday of rng.shuffle(mondays).slice(0, 6)) {
					const end = monday.add({ days: window.days <= 5 ? window.days - 1 : 11 });
					if (
						Temporal.PlainDate.compare(end, window.to) > 0 ||
						Temporal.PlainDate.compare(end, calendar.yesterday) > 0 ||
						Temporal.PlainDate.compare(monday, entryDate) < 0 ||
						(exitDate && Temporal.PlainDate.compare(end, exitDate) > 0) ||
						blocked(person, monday, end) ||
						// the capped lead's last closed month has to carry its full overtime
						(person === cast.capped &&
							(monday.toPlainYearMonth().equals(calendar.lastClosed) ||
								end.toPlainYearMonth().equals(calendar.lastClosed)))
					) {
						continue;
					}
					vacation(person, monday, end);
					break;
				}
			}
		}
	}

	// a few ordinary sick notes in the first half year, away from month ends and closings
	for (const person of rng.shuffle(cast.people).slice(0, 4)) {
		for (let attempt = 0; attempt < 10; attempt++) {
			const start = on(1, 12).add({ days: rng.int(0, 150) });
			const end = start.add({ days: rng.int(0, 2) });
			if (
				start.dayOfWeek > 5 ||
				end.dayOfWeek > 5 ||
				end.day > end.daysInMonth - 5 ||
				Temporal.PlainDate.compare(start, person.employment.entryDate) < 0 ||
				blocked(person, start, end)
			) {
				continue;
			}
			confirm(ask(person, 'sick', start, end, at(start, 420, 480)));
			break;
		}
	}
	return leaves;
}

// what sits in the lead's inbox today, plus the request that was turned down last week
export function openRequests(
	rng: Random,
	cast: Cast,
	calendar: Calendar,
	leaves: Leave[],
	specials: readonly Special[]
): void {
	const { at, ask } = office(rng, cast, calendar, leaves);
	const { today } = calendar;
	const ago = (days: number) => today.subtract({ days });

	const firstWeek = weekdayFrom(today.add({ days: 28 }), 1);
	const refused = ask(cast.busy, 'vacation', firstWeek, firstWeek.add({ days: 4 }), at(ago(9)));
	refused.row.status = 'rejected';
	refused.row.decidedBy = leadOf(cast, cast.busy).id;
	refused.row.decidedAt = iso(at(ago(7), 840, 960));
	refused.row.decisionNote =
		'In der Woche sind die Jahresabschlüsse von zwei Mandanten fällig, geht es eine Woche später?';
	ask(cast.busy, 'vacation', firstWeek.add({ days: 7 }), firstWeek.add({ days: 11 }), at(ago(6)));
	ask(
		cast.worker,
		'vacation',
		firstWeek.add({ days: 14 }),
		firstWeek.add({ days: 18 }),
		at(ago(2))
	);

	const free = (date: Temporal.PlainDate) =>
		targetOn(calendar, cast.partTimer.employment, date) > 0 &&
		!isAway(leaves, cast.partTimer, date) &&
		!specials.some((special) => special.person === cast.partTimer && special.date.equals(date));
	// the forgotten entry blocks the previous month by itself when it lies there
	const forgot = specials.find((special) => special.running)!.date;
	if (forgot.toPlainYearMonth().equals(today.toPlainYearMonth())) {
		const previous = eachDay(
			calendar.previous.toPlainDate({ day: 1 }),
			endOfMonth(calendar.previous)
		);
		const day =
			previous.find((date) => date.day >= 15 && date.dayOfWeek === 5 && free(date)) ??
			previous.findLast(free)!;
		ask(cast.partTimer, 'time_off', day, day, at(day.subtract({ days: 4 })));
	} else {
		let day = weekdayFrom(today.add({ days: 7 }), 5);
		while (!free(day)) day = day.add({ days: 7 });
		ask(cast.partTimer, 'time_off', day, day, at(ago(1)));
	}
}

export function dayRows(
	rng: Random,
	calendar: Calendar,
	leaves: readonly Leave[]
): PlanRow<'absenceDays'>[] {
	const rows: PlanRow<'absenceDays'>[] = [];
	for (const { person, row } of leaves) {
		const costs = daysForRange(
			{
				start: Temporal.PlainDate.from(row.startDate),
				end: Temporal.PlainDate.from(row.endDate),
				halfDayStart: row.halfDayStart,
				halfDayEnd: row.halfDayEnd
			},
			person.employment,
			calendar.holidays
		);
		// rejected and cancelled requests free their days again
		const gone = !ACTIVE.includes(row.status);
		for (const cost of costs.filter((day): day is Worked => day.portion > 0)) {
			rows.push({
				id: rng.uuid(),
				employeeId: row.employeeId,
				absenceId: row.id,
				date: cost.date.toString(),
				portion: cost.portion,
				targetMinutes: cost.targetMinutes,
				vacationDays: row.type === 'vacation' ? toDecimal(cost.vacationDays, 2) : '0.00',
				supersededAt: gone ? row.decidedAt : null,
				supersededBy: null
			});
		}
	}

	// a confirmed sick note takes over the vacation days beneath it, § 9 BUrlG
	const vacations = new Set(
		leaves.filter(({ row }) => row.type === 'vacation').map(({ row }) => row.id)
	);
	for (const { row: sick } of leaves) {
		if (sick.type !== 'sick' || sick.certificateConfirmedAt === null) continue;
		for (const day of rows) {
			if (
				day.employeeId === sick.employeeId &&
				vacations.has(day.absenceId) &&
				day.supersededAt === null &&
				sick.startDate <= day.date &&
				day.date <= sick.endDate
			) {
				day.supersededAt = sick.certificateConfirmedAt;
				day.supersededBy = sick.id;
			}
		}
	}
	return rows;
}
