import {
	accountBalance,
	add,
	applyCap,
	checkShifts,
	dayBalance,
	fraction,
	groupShifts,
	parseDecimal,
	ruleSetFor,
	toDecimal,
	type CapMode,
	type DayMinutes,
	type FlexCap
} from '@zeit/rules';
import type { AbsenceStatus, Totals } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import {
	byStamp,
	eachDay,
	endOfMonth,
	iso,
	local,
	nthBusinessDay,
	targetOn,
	TZ,
	type Calendar
} from './calendar';
import type { MonthSnapshot, PlanRow } from './index';
import type { Leave } from './leave';
import type { Random } from './random';
import type { Sheet } from './shifts';
import { officeOf, type Cast, type Person } from './staff';

type BookingRow = PlanRow<'flexBookings'>;
type ClosingRow = PlanRow<'monthClosings'>;
type Day = DayMinutes & { date: Temporal.PlainDate };

// the schema leaves a new tenant without any cap, these are the settings the web mocks show
export const FLEX_CAP = {
	plusMinutes: 2400,
	minusMinutes: 600,
	mode: 'forfeit_at_close'
} as const satisfies FlexCap & { mode: CapMode };

// the capped lead goes into the last closed month an hour below the cap
const HEADROOM = 60;

const CREDITED: readonly AbsenceStatus[] = ['approved', 'cancel_pending'];
const zero = fraction(0);

const totalsOf = (days: readonly Day[]): Totals =>
	days.reduce(
		(sum, day) => ({
			targetMinutes: sum.targetMinutes + day.targetMinutes,
			workedMinutes: sum.workedMinutes + day.workedMinutes,
			creditedMinutes: sum.creditedMinutes + day.creditedMinutes,
			diffMinutes: sum.diffMinutes + dayBalance(day)
		}),
		{ targetMinutes: 0, workedMinutes: 0, creditedMinutes: 0, diffMinutes: 0 }
	);

const through = (days: readonly Day[], date: Temporal.PlainDate) =>
	accountBalance(
		days.filter((day) => Temporal.PlainDate.compare(day.date, date) <= 0),
		[]
	);

// close() of the api replayed month by month, with the opening balances chosen so the roster comes out
export function settle(
	rng: Random,
	cast: Cast,
	calendar: Calendar,
	sheets: ReadonlyMap<Person, Sheet>,
	leaves: readonly Leave[],
	absenceDays: readonly PlanRow<'absenceDays'>[],
	acks: readonly PlanRow<'findingAcks'>[]
): { bookings: BookingRow[]; closings: ClosingRow[] } {
	const requests = new Map(leaves.map(({ row }) => [row.id, row]));
	// time off costs the target, a pending request only shows on the day
	const credited = absenceDays.flatMap((day) => {
		const { type, status } = requests.get(day.absenceId)!;
		return day.supersededAt === null && type !== 'time_off' && CREDITED.includes(status)
			? [{ ...day, type }]
			: [];
	});
	const portions = new Map(credited.map((day) => [`${day.employeeId} ${day.date}`, day.portion]));

	const bookings: BookingRow[] = [];
	const ledgers = new Map<Person, Day[]>();
	const balances = new Map<Person, number>();
	for (const person of cast.people) {
		const { worked } = sheets.get(person)!;
		const days = eachDay(calendar.start, calendar.yesterday).map((date): Day => {
			const targetMinutes = targetOn(calendar, person.employment, date);
			const portion = portions.get(`${person.employee.id} ${date}`) ?? 0;
			return {
				date,
				targetMinutes,
				workedMinutes: worked.get(date.toString()) ?? 0,
				creditedMinutes: Math.round(targetMinutes * portion)
			};
		});
		ledgers.set(person, days);

		const beforeLast = endOfMonth(calendar.lastClosed.subtract({ months: 1 }));
		const opening =
			person === cast.capped
				? FLEX_CAP.plusMinutes - HEADROOM - through(days, beforeLast)
				: person.balance === null
					? 0
					: person.balance - through(days, calendar.yesterday);
		balances.set(person, opening);
		// a newcomer starts at zero, and minutes <> 0 would refuse an empty opening anyway
		if (opening === 0) continue;
		bookings.push({
			id: rng.uuid(),
			employeeId: person.employee.id,
			type: 'opening',
			minutes: opening,
			effectiveDate: calendar.start.toString(),
			reason: `Gleitzeitsaldo ${calendar.year - 1} aus dem Vorsystem übernommen`,
			monthClosingId: null,
			createdBy: officeOf(cast, person).id,
			createdAt: iso(local(calendar.start.add({ days: 1 }), 520))
		});
	}

	const findings = new Map(
		cast.people.map((person) => [
			person,
			checkShifts(groupShifts(sheets.get(person)!.spans, TZ), {
				timeZone: TZ,
				holidays: calendar.holidays,
				range: { from: calendar.start, to: calendar.yesterday }
			})
		])
	);

	const closings: ClosingRow[] = [];
	for (
		let month = calendar.start.toPlainYearMonth();
		Temporal.PlainYearMonth.compare(month, calendar.lastClosed) <= 0;
		month = month.add({ months: 1 })
	) {
		const first = month.toPlainDate({ day: 1 });
		const last = endOfMonth(month);
		const id = rng.uuid();
		const createdAt = iso(
			local(nthBusinessDay(calendar, month.add({ months: 1 }), 3), rng.int(540, 660))
		);
		// a reform starts on one day, the first and the last day of the month see both sides of it
		const snapshot: MonthSnapshot = {
			ruleVersions: [...new Set([first, last].map((date) => ruleSetFor(date).version))],
			employees: {}
		};

		for (const person of cast.people) {
			const { entryDate, exitDate } = person.employment;
			if (
				Temporal.PlainDate.compare(entryDate, last) > 0 ||
				(exitDate && Temporal.PlainDate.compare(exitDate, first) < 0)
			) {
				continue;
			}
			const employeeId = person.employee.id;
			const totals = totalsOf(
				ledgers.get(person)!.filter((day) => day.date.toPlainYearMonth().equals(month))
			);
			const cap = applyCap(balances.get(person)! + totals.diffMinutes, FLEX_CAP, FLEX_CAP.mode);
			balances.set(person, cap.kept);
			if (cap.forfeited !== 0) {
				bookings.push({
					id: rng.uuid(),
					employeeId,
					type: 'cap_forfeit',
					minutes: -cap.forfeited,
					effectiveDate: last.toString(),
					reason: `Kappung beim Abschluss ${month}`,
					monthClosingId: id,
					createdBy: cast.hr.user.id,
					createdAt
				});
			}

			const away = credited.filter(
				(day) => day.employeeId === employeeId && day.date.startsWith(month.toString())
			);
			const open = findings
				.get(person)!
				.filter(
					(finding) =>
						finding.date.toPlainYearMonth().equals(month) &&
						!acks.some(
							(ack) =>
								ack.employeeId === employeeId &&
								ack.workDate === finding.date.toString() &&
								ack.ruleCode === finding.code &&
								byStamp(ack.createdAt, createdAt) < 0
						)
				);
			snapshot.employees[employeeId] = {
				...totals,
				flexBalanceMinutes: cap.kept,
				vacationDays: toDecimal(
					away
						.filter((day) => day.type === 'vacation')
						.reduce((sum, day) => add(sum, parseDecimal(day.vacationDays)), zero),
					2
				),
				sickDays: toDecimal(
					away
						.filter((day) => day.type === 'sick')
						.reduce((sum, day) => add(sum, fraction(day.portion * 2, 2)), zero),
					2
				),
				openFindings: open.length
			};
		}

		closings.push({
			id,
			month: first.toString(),
			action: 'close',
			reason: null,
			snapshot,
			createdBy: cast.hr.user.id,
			createdAt
		});
	}
	return { bookings, closings };
}
