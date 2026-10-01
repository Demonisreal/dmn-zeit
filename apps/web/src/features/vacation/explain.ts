import { holidayCodes, type Explanation, type HolidayCode } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { formatDate, formatDays } from '../../i18n/format';

const known = [
	'vacation.entitlement.full_year',
	'vacation.entitlement.pro_rata',
	'vacation.entitlement.full_on_exit',
	'vacation.entitlement.rounded_up',
	'vacation.entitlement.statutory_minimum',
	'vacation.entitlement.waiting_period',
	'vacation.entitlement.no_employment',
	'vacation.day.workday',
	'vacation.day.half_holiday',
	'vacation.day.holiday',
	'vacation.day.non_working_day',
	'vacation.day.outside_employment',
	'vacation.expiry.not_due',
	'vacation.expiry.no_notice',
	'vacation.expiry.forfeited',
	'vacation.sick_refund'
] as const;

const isKnown = (key: string): key is (typeof known)[number] =>
	(known as readonly string[]).includes(key);

const isHoliday = (code: string): code is HolidayCode =>
	(holidayCodes as readonly string[]).includes(code);

export function useHolidayName() {
	const { t } = useTranslation('vacation');
	return (code: string) => (isHoliday(code) ? t(`holiday.${code}`) : code);
}

export function useExplain() {
	const { t, i18n } = useTranslation('vacation');
	const holidayName = useHolidayName();
	const lng = i18n.language;
	return ({ key, params }: Explanation) => {
		if (!isKnown(key)) return key;
		if (key === 'vacation.day.workday' && params.portion === 0.5) {
			return t('explain.vacation.day.half_workday');
		}
		const values: Record<string, string | number> = { ...params };
		if (params.until) values.until = formatDate(String(params.until), lng);
		if (params.deadline) values.deadline = formatDate(String(params.deadline), lng);
		if (params.days) values.days = formatDays(String(params.days), lng);
		if (params.exact) values.exact = formatDays(String(params.exact), lng);
		if (params.code) values.code = holidayName(String(params.code));
		if (params.months) values.count = Number(params.months);
		return t(`explain.${key}`, values);
	};
}
