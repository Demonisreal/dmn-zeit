import {
	CalendarDate,
	getDayOfWeek,
	parseAbsolute,
	parseDate,
	startOfWeek,
	toCalendarDate
} from '@internationalized/date';
import { weekdays } from '@zeit/shared';
import { formatDate } from '../../i18n/format';
import { zone } from '../../lib/dates';

export const addDays = (iso: string, days: number) => parseDate(iso).add({ days }).toString();

export const mondayOf = (iso: string) => startOfWeek(parseDate(iso), 'de-DE').toString();

export const weekdayOf = (iso: string) => weekdays[getDayOfWeek(parseDate(iso), 'de-DE')]!;

export function isoWeek(monday: string) {
	const thursday = parseDate(monday).add({ days: 3 });
	return Math.floor(thursday.compare(new CalendarDate(thursday.year, 1, 1)) / 7) + 1;
}

export function minuteOn(instant: string, date: string) {
	const at = parseAbsolute(instant, zone);
	return toCalendarDate(at).compare(parseDate(date)) * 1440 + at.hour * 60 + at.minute;
}

export const dateOf = (instant: string) => toCalendarDate(parseAbsolute(instant, zone)).toString();

export const shortDate = (iso: string, lng: string) => formatDate(iso, lng, { year: undefined });

export const weekdayShort = (iso: string, lng: string) =>
	formatDate(iso, lng, { weekday: 'short', day: undefined, month: undefined, year: undefined });
