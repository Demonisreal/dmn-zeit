import { endOfMonth, parseDate, today } from '@internationalized/date';

// the company's day, someone abroad still sees the German workday
export const zone = 'Europe/Berlin';

export const todayIso = () => today(zone).toString();
export const currentMonth = () => todayIso().slice(0, 7);
export const currentYear = () => Number(todayIso().slice(0, 4));

export const shiftMonth = (month: string, by: number) =>
	parseDate(`${month}-01`).add({ months: by }).toString().slice(0, 7);

export const lastOfMonth = (month: string) => endOfMonth(parseDate(`${month}-01`)).toString();
