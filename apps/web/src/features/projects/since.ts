import { formatTime } from '../../i18n/format';
import { todayIso } from '../../lib/dates';
import { dateOf, shortDate } from '../week/dates';

// a timer from yesterday needs its date, one from today only the time
export const sinceLabel = (instant: string, lng: string) =>
	dateOf(instant) === todayIso()
		? formatTime(instant, lng)
		: `${shortDate(dateOf(instant), lng)} ${formatTime(instant, lng)}`;
