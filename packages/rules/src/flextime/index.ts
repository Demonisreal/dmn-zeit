import type { FlexCap } from '../contracts';
import type { Explanation } from '../explanation';

export type CapMode = 'none' | 'forfeit_at_close' | 'warn';
export type FlexBookingType = 'opening' | 'manual' | 'payout' | 'cap_forfeit';

export type DayMinutes = {
	targetMinutes: number;
	workedMinutes: number;
	creditedMinutes: number;
};

export type FlexBooking = {
	type: FlexBookingType;
	minutes: number;
};

export type CapDecision = {
	kept: number;
	forfeited: number;
	explanation: Explanation;
};

export const dayBalance = (day: DayMinutes): number =>
	day.workedMinutes + day.creditedMinutes - day.targetMinutes;

export const accountBalance = (
	days: readonly DayMinutes[],
	bookings: readonly FlexBooking[]
): number =>
	days.reduce((sum, day) => sum + dayBalance(day), 0) +
	bookings.reduce((sum, booking) => sum + booking.minutes, 0);

export const applyCap = (balanceMinutes: number, cap: FlexCap, mode: CapMode): CapDecision => {
	const upper = cap.plusMinutes ?? Infinity;
	const lower = 0 - (cap.minusMinutes ?? Infinity);
	const uncapped = (key: string, params: Explanation['params'] = {}): CapDecision => ({
		kept: balanceMinutes,
		forfeited: 0,
		explanation: { key, params }
	});
	const forfeit = (kept: number, key: string): CapDecision => {
		const forfeited = balanceMinutes - kept;
		return { kept, forfeited, explanation: { key, params: { forfeited } } };
	};

	switch (mode) {
		case 'none':
			return uncapped('flex.cap.none');
		case 'warn':
			if (balanceMinutes > upper) {
				return uncapped('flex.cap.warn_over', { balanceMinutes });
			}
			if (balanceMinutes < lower) {
				return uncapped('flex.cap.warn_under', { balanceMinutes });
			}
			return uncapped('flex.cap.warn_ok');
		case 'forfeit_at_close':
			if (balanceMinutes > upper) {
				return forfeit(upper, 'flex.cap.forfeit_over');
			}
			if (balanceMinutes < lower) {
				return forfeit(lower, 'flex.cap.forfeit_under');
			}
			return uncapped('flex.cap.forfeit_ok');
	}
};
