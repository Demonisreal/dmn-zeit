import {
	CalendarDate,
	endOfMonth,
	getDayOfWeek,
	parseAbsolute,
	parseDate,
	startOfWeek,
	toCalendarDate,
	today
} from '@internationalized/date';
import { weekdays } from '@zeit/shared';
import { formatDate, tagFor } from '../../i18n/format';

// the company's day, someone abroad still sees the German workday
export const zone = 'Europe/Berlin';

export const todayIso = () => today(zone).toString();

export const addDays = (iso: string, days: number) => parseDate(iso).add({ days }).toString();

export const mondayOf = (iso: string) => startOfWeek(parseDate(iso), 'de-DE').toString();

export const weekdayOf = (iso: string) => weekdays[getDayOfWeek(parseDate(iso), 'de-DE')]!;

// iso 8601: a week belongs to the year its thursday falls in
export function isoWeek(monday: string) {
	const thursday = parseDate(monday).add({ days: 3 });
	return Math.floor(thursday.compare(new CalendarDate(thursday.year, 1, 1)) / 7) + 1;
}

export const shiftMonth = (month: string, by: number) =>
	parseDate(`${month}-01`).add({ months: by }).toString().slice(0, 7);

export const lastOfMonth = (month: string) => endOfMonth(parseDate(`${month}-01`)).toString();

// minutes after the local midnight of date, a shift over midnight ends past 1440
export function minuteOn(instant: string, date: string) {
	const at = parseAbsolute(instant, zone);
	return toCalendarDate(at).compare(parseDate(date)) * 1440 + at.hour * 60 + at.minute;
}

export const dateOf = (instant: string) => toCalendarDate(parseAbsolute(instant, zone)).toString();

export const shortDate = (iso: string, lng: string) => formatDate(iso, lng, { year: undefined });

export const weekdayShort = (iso: string, lng: string) =>
	formatDate(iso, lng, { weekday: 'short', day: undefined, month: undefined, year: undefined });

export const monthName = (month: string, lng: string) =>
	new Intl.DateTimeFormat(tagFor(lng), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
		new Date(`${month}-01T00:00:00Z`)
	);
