import {
	holidaysFor,
	parseDecimal,
	targetMinutes,
	wholeMinutes,
	type Employment
} from '@zeit/rules';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { eachDay, endOfMonth } from './calendar';
import { generateDemo, type DemoPlan, type PlanRow } from './index';

const holidays = new Map(
	[2026, 2027]
		.flatMap((year) => holidaysFor(year, 'NW', { optional: [], halfDays: false }))
		.map((holiday) => [holiday.date.toString(), holiday])
);

const employmentOf = (plan: DemoPlan, employee: PlanRow<'employees'>): Employment => ({
	entryDate: Temporal.PlainDate.from(employee.entryDate),
	exitDate: employee.exitDate === null ? null : Temporal.PlainDate.from(employee.exitDate),
	contracts: plan.contracts
		.filter((contract) => contract.employeeId === employee.id)
		.map((contract) => ({
			validFrom: Temporal.PlainDate.from(contract.validFrom),
			minutes: contract.minutes,
			vacationDaysYear: parseDecimal(contract.vacationDaysYear),
			vacationBasisDays: contract.vacationBasisDays,
			capOverride: null
		}))
});

// rebuilt from the rows alone, the forgotten entry ends where its pending correction says
function balanceOn(plan: DemoPlan, employee: PlanRow<'employees'>, through: Temporal.PlainDate) {
	const until = through.toString();
	const employment = employmentOf(plan, employee);
	const target = eachDay(Temporal.PlainDate.from('2026-01-01'), through).reduce(
		(sum, date) =>
			sum + targetMinutes(employment, date, holidays.get(date.toString()) ?? null).minutes,
		0
	);
	const worked = wholeMinutes(
		plan.entries.flatMap((entry) => {
			if (entry.employeeId !== employee.id || entry.startedAt.slice(0, 10) > until) return [];
			const end =
				entry.endedAt ??
				plan.corrections.find((correction) => correction.targetEntryId === entry.id)?.newEndedAt;
			return end
				? [{ start: Temporal.Instant.from(entry.startedAt), end: Temporal.Instant.from(end) }]
				: [];
		})
	);
	const requests = new Map(plan.absences.map((absence) => [absence.id, absence]));
	// time off is charged against the target, a pending request is not credited yet
	const credited = plan.absenceDays
		.filter((day) => {
			const { type, status } = requests.get(day.absenceId)!;
			return (
				day.employeeId === employee.id &&
				day.date <= until &&
				day.supersededAt === null &&
				type !== 'time_off' &&
				(status === 'approved' || status === 'cancel_pending')
			);
		})
		.reduce((sum, day) => sum + day.targetMinutes, 0);
	const booked = plan.flexBookings
		.filter((booking) => booking.employeeId === employee.id && booking.effectiveDate <= until)
		.reduce((sum, booking) => sum + booking.minutes, 0);
	return booked + worked + credited - target;
}

describe.each([
	{ today: '2026-09-24', lastClosed: '2026-07' },
	// before august the story starts a year earlier and runs for nineteen months
	{ today: '2027-07-31', lastClosed: '2027-05' }
])('generateDemo flextime on $today', ({ today, lastClosed }) => {
	const plan = generateDemo({ today: Temporal.PlainDate.from(today), seed: 7 });
	const yesterday = Temporal.PlainDate.from(today).subtract({ days: 1 });
	const closedMonth = Temporal.PlainYearMonth.from(lastClosed);
	const caps = plan.flexBookings.filter((booking) => booking.type === 'cap_forfeit');
	const capped = plan.employees.find((employee) => employee.id === caps[0]?.employeeId);

	it('spreads the balances from -6 h to +38 h on the evening before today', () => {
		const balances = plan.employees.map((employee) => balanceOn(plan, employee, yesterday));
		expect(Math.min(...balances)).toBe(-360);
		expect(Math.max(...balances)).toBe(2280);
	});

	it('cuts one balance at the last closing and none before', () => {
		expect(caps).toHaveLength(1);
		const closing = plan.monthClosings.find(
			(candidate) => candidate.id === caps[0]!.monthClosingId
		);
		expect(closing?.month).toBe(closedMonth.toPlainDate({ day: 1 }).toString());
		expect(caps[0]!.effectiveDate).toBe(endOfMonth(closedMonth).toString());
		expect(caps[0]!.minutes).toBeLessThan(0);
		expect(plan.tenant.flexCapMode).toBe('forfeit_at_close');
	});

	it('leaves the capped balance on the limit, and two hours short of it today', () => {
		const limit = plan.tenant.flexCapPlusMinutes;
		expect(limit).toBe(2400);
		const before = endOfMonth(closedMonth.subtract({ months: 1 }));
		expect(balanceOn(plan, capped!, before)).toBeLessThan(limit!);
		expect(balanceOn(plan, capped!, endOfMonth(closedMonth))).toBe(limit);
		expect(balanceOn(plan, capped!, yesterday)).toBe(2280);
	});

	it('stores the balance each closing left behind in its snapshot', () => {
		for (const closing of plan.monthClosings) {
			const month = Temporal.PlainYearMonth.from(closing.month.slice(0, 7));
			for (const [employeeId, figures] of Object.entries(closing.snapshot!.employees)) {
				const employee = plan.employees.find((candidate) => candidate.id === employeeId)!;
				expect(figures.flexBalanceMinutes, `${employee.lastName} ${month}`).toBe(
					balanceOn(plan, employee, endOfMonth(month))
				);
			}
		}
	}, 30_000);
});
