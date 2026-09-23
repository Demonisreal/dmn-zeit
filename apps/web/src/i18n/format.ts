// en-GB keeps the 24 hour clock and day before month, the app runs in German workplaces
export const tagFor = (lng: string) => (lng === 'en' ? 'en-GB' : 'de-DE');

export function formatMinutes(minutes: number, { signed = false } = {}): string {
	const abs = Math.abs(minutes);
	// a real minus sign, the hyphen is too short next to the digits
	const sign = minutes < 0 ? '−' : signed && minutes > 0 ? '+' : '';
	return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')} h`;
}

export function formatClock(minuteOfDay: number): string {
	const h = Math.floor(minuteOfDay / 60);
	return `${String(h).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

// iso days carry no zone, formatting them in utc keeps the calendar date
export function formatDate(isoDate: string, lng: string, options?: Intl.DateTimeFormatOptions) {
	return new Intl.DateTimeFormat(tagFor(lng), {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		...options,
		timeZone: 'UTC'
	}).format(new Date(`${isoDate}T00:00:00Z`));
}

export function formatTime(instant: string, lng: string) {
	return new Intl.DateTimeFormat(tagFor(lng), {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Europe/Berlin'
	}).format(new Date(instant));
}

// leave days arrive as numeric strings with two decimals
export function formatDays(days: string, lng: string) {
	return new Intl.NumberFormat(tagFor(lng), {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(Number(days));
}
