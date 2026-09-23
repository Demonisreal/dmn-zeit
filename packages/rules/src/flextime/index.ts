import type { FlexCap } from '../contracts';
import type { Explanation } from '../explanation';
import { notImplemented } from '../stub';

export type CapMode = 'none' | 'forfeit_at_close' | 'warn';
export type FlexBookingType = 'opening' | 'manual' | 'payout' | 'cap_forfeit';

// credited covers vacation, sickness and holidays; time off credits nothing and so costs the target
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

export const dayBalance: (day: DayMinutes) => number = notImplemented;
export const accountBalance: (
	days: readonly DayMinutes[],
	bookings: readonly FlexBooking[]
) => number = notImplemented;
export const applyCap: (balanceMinutes: number, cap: FlexCap, mode: CapMode) => CapDecision =
	notImplemented;
