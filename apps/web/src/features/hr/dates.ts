import { today } from '@internationalized/date';

// the company day, not the browser's: someone abroad still closes the German month
export const todayIso = () => today('Europe/Berlin').toString();
export const currentMonth = () => todayIso().slice(0, 7);
export const currentYear = () => Number(todayIso().slice(0, 4));

export function shiftMonth(month: string, by: number) {
	const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function lastDayOf(month: string) {
	const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
	return `${month}-${String(days.getUTCDate()).padStart(2, '0')}`;
}

export const monthsBack = (from: string, count: number) =>
	Array.from({ length: count }, (_, i) => shiftMonth(from, -i));
