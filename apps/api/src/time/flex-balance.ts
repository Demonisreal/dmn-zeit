import type { Day, FlexBooking } from '@zeit/shared';
import { summarizeFlex } from './day-engine';
import type { Sheet } from './time.store';

export function flexBalance(
	sheet: Sheet,
	days: readonly Day[],
	bookings: readonly FlexBooking[],
	carryovers: ReadonlyMap<string, number>,
	asOf: string
): ReturnType<typeof summarizeFlex> {
	const { id, closedThrough } = sheet.employee;
	const flex = summarizeFlex(
		days.filter((day) => day.date <= asOf),
		bookings.filter((booking) => booking.employeeId === id && booking.effectiveDate <= asOf),
		closedThrough
	);
	const carried = carryovers.get(id) ?? 0;
	return {
		openingMinutes: flex.openingMinutes,
		balanceMinutes: flex.balanceMinutes + carried,
		months: flex.months.map((month) => ({
			...month,
			balanceMinutes: month.balanceMinutes + carried
		}))
	};
}
