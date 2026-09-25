import { dateFormat } from '../../i18n/format';

// the demo tour still imports it from here
export { todayIso } from '../../lib/dates';

export const yearSpan = (year: number) => ({ from: `${year}-01-01`, to: `${year}-12-31` });

const utc = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

export function formatPeriod(start: string, end: string, lng: string) {
	return dateFormat(lng, {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		timeZone: 'UTC'
	}).formatRange(utc(start), utc(end));
}
