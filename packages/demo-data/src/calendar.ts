import { holidaysFor, targetMinutes, type Employment, type Holiday } from '@zeit/rules';
import { Temporal } from 'temporal-polyfill';

export const TZ = 'Europe/Berlin';

export type Calendar = {
	today: Temporal.PlainDate;
	yesterday: Temporal.PlainDate;
	year: number;
	start: Temporal.PlainDate;
	previous: Temporal.PlainYearMonth;
	lastClosed: Temporal.PlainYearMonth;
	closedThrough: Temporal.PlainDate;
	holidays: Holiday[];
	holidayOn: (date: Temporal.PlainDate) => Holiday | null;
};

export function calendarFor(today: Temporal.PlainDate): Calendar {
	const year = today.month >= 8 ? today.year : today.year - 1;
	const month = today.toPlainYearMonth();
	const lastClosed = month.subtract({ months: 2 });
	const holidays: Holiday[] = [];
	for (let each = year; each <= today.year + 1; each++) {
		holidays.push(...holidaysFor(each, 'NW', { optional: [], halfDays: false }));
	}
	const byDate = new Map(holidays.map((holiday) => [holiday.date.toString(), holiday]));
	return {
		today,
		yesterday: today.subtract({ days: 1 }),
		year,
		start: Temporal.PlainDate.from({ year, month: 1, day: 1 }),
		previous: month.subtract({ months: 1 }),
		lastClosed,
		closedThrough: endOfMonth(lastClosed),
		holidays,
		holidayOn: (date) => byDate.get(date.toString()) ?? null
	};
}

export const endOfMonth = (month: Temporal.PlainYearMonth): Temporal.PlainDate =>
	month.toPlainDate({ day: month.daysInMonth });

export const local = (date: Temporal.PlainDate, minutes: number, second = 0): Temporal.Instant =>
	date
		.add({ days: Math.floor(minutes / 1440) })
		.toZonedDateTime({
			timeZone: TZ,
			plainTime: new Temporal.PlainTime(Math.floor((minutes % 1440) / 60), minutes % 60, second)
		})
		.toInstant();

export const iso = (instant: Temporal.Instant): string =>
	instant.toZonedDateTimeISO(TZ).toString({ timeZoneName: 'never' });

export const dateOf = (instant: Temporal.Instant): Temporal.PlainDate =>
	instant.toZonedDateTimeISO(TZ).toPlainDate();

export const byStamp = (a: string, b: string): number =>
	Temporal.Instant.compare(Temporal.Instant.from(a), Temporal.Instant.from(b));

export const clockTime = (minutes: number): string =>
	`${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function eachDay(from: Temporal.PlainDate, to: Temporal.PlainDate): Temporal.PlainDate[] {
	const days: Temporal.PlainDate[] = [];
	for (let date = from; Temporal.PlainDate.compare(date, to) <= 0; date = date.add({ days: 1 })) {
		days.push(date);
	}
	return days;
}

export const earlier = (a: Temporal.PlainDate, b: Temporal.PlainDate) =>
	Temporal.PlainDate.compare(a, b) <= 0 ? a : b;
export const later = (a: Temporal.PlainDate, b: Temporal.PlainDate) =>
	Temporal.PlainDate.compare(a, b) >= 0 ? a : b;

export const weekdayFrom = (date: Temporal.PlainDate, weekday: number): Temporal.PlainDate =>
	date.add({ days: (weekday - date.dayOfWeek + 7) % 7 });

export function lastWeekday(month: Temporal.PlainYearMonth, weekday: number): Temporal.PlainDate {
	const end = endOfMonth(month);
	return end.subtract({ days: (end.dayOfWeek - weekday + 7) % 7 });
}

export const isBusinessDay = (calendar: Calendar, date: Temporal.PlainDate) =>
	date.dayOfWeek <= 5 && calendar.holidayOn(date) === null;

export function nextBusinessDay(calendar: Calendar, date: Temporal.PlainDate): Temporal.PlainDate {
	let next = date.add({ days: 1 });
	while (!isBusinessDay(calendar, next)) next = next.add({ days: 1 });
	return next;
}

export function nthBusinessDay(
	calendar: Calendar,
	month: Temporal.PlainYearMonth,
	n: number
): Temporal.PlainDate {
	let date = month.toPlainDate({ day: 1 });
	let count = isBusinessDay(calendar, date) ? 1 : 0;
	while (count < n) {
		date = nextBusinessDay(calendar, date);
		count++;
	}
	return date;
}

export const targetOn = (calendar: Calendar, employment: Employment, date: Temporal.PlainDate) =>
	targetMinutes(employment, date, calendar.holidayOn(date)).minutes;
