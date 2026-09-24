import { tagFor } from '../../i18n/format';

export function formatInstant(
	instant: string,
	lng: string,
	options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
) {
	return new Intl.DateTimeFormat(tagFor(lng), { ...options, timeZone: 'Europe/Berlin' }).format(
		new Date(instant)
	);
}
