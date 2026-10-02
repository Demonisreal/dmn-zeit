import { formatTime } from '../../i18n/format';
import { todayIso } from '../../lib/dates';
import { dateOf, shortDate } from '../week/dates';

export const sinceLabel = (instant: string, lng: string) =>
	dateOf(instant) === todayIso()
		? formatTime(instant, lng)
		: `${shortDate(dateOf(instant), lng)} ${formatTime(instant, lng)}`;
