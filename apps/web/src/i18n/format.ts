// en-GB keeps the 24 hour clock and day before month, the app runs in German workplaces
export const tagFor = (lng: string) => (lng === 'en' ? 'en-GB' : 'de-DE');

// building an Intl formatter costs far more than using one, the tables format every cell
type Formatter = Intl.DateTimeFormat | Intl.NumberFormat | Intl.ListFormat;
const formatters = new Map<string, Formatter>();

function reuse<T extends Formatter>(key: string, create: () => T): T {
	if (!formatters.has(key)) formatters.set(key, create());
	return formatters.get(key) as T;
}

export const dateFormat = (lng: string, options: Intl.DateTimeFormatOptions) =>
	reuse(
		`date:${lng}:${JSON.stringify(options)}`,
		() => new Intl.DateTimeFormat(tagFor(lng), options)
	);

const numberFormat = (lng: string, options: Intl.NumberFormatOptions) =>
	reuse(
		`number:${lng}:${JSON.stringify(options)}`,
		() => new Intl.NumberFormat(tagFor(lng), options)
	);

export const listFormat = (lng: string) => reuse(`list:${lng}`, () => new Intl.ListFormat(lng));

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
	return dateFormat(lng, {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		...options,
		timeZone: 'UTC'
	}).format(new Date(`${isoDate}T00:00:00Z`));
}

export function formatMonth(month: string, lng: string) {
	return formatDate(`${month}-01`, lng, { day: undefined, month: 'long' });
}

export function formatTime(instant: string, lng: string) {
	return dateFormat(lng, {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Europe/Berlin'
	}).format(new Date(instant));
}

export function formatInstant(
	instant: string,
	lng: string,
	options: Intl.DateTimeFormatOptions = {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	}
) {
	return dateFormat(lng, { ...options, timeZone: 'Europe/Berlin' }).format(new Date(instant));
}

export function formatDays(days: string, lng: string) {
	return numberFormat(lng, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
		Number(days)
	);
}
