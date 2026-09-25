import { today } from '@internationalized/date';
import { tagFor } from '../../i18n/format';

// the company's calendar, not the browser's: leave is booked on German days
export const todayIso = () => today('Europe/Berlin').toString();
export const currentYear = () => Number(todayIso().slice(0, 4));

export const yearSpan = (year: number) => ({ from: `${year}-01-01`, to: `${year}-12-31` });

const utc = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

export function formatPeriod(start: string, end: string, lng: string) {
	return new Intl.DateTimeFormat(tagFor(lng), {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		timeZone: 'UTC'
	}).formatRange(utc(start), utc(end));
}
