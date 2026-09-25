import type { ArbzgCode, Explanation, HolidayCode, Weekday } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { formatDate, formatMinutes } from '../../i18n/format';

// ARBZG_4_BREAK_SHORT is § 4
export const paragraph = (code: ArbzgCode) => `§ ${code.split('_')[1]}`;

export function useExplain() {
	const { t, i18n } = useTranslation('week');

	// the rules hand over raw minutes, iso dates, weekday and holiday codes, the words come from here
	const words = (params: Explanation['params']) =>
		Object.fromEntries(
			Object.entries(params).map(([name, raw]) => {
				if (typeof raw === 'number' && /minutes$/i.test(name)) return [name, formatMinutes(raw)];
				if (name === 'weekday') return [name, t(`weekday.${raw as Weekday}`)];
				if (name === 'code') return [name, t(`holiday.${raw as HolidayCode}`)];
				if (name === 'validFrom') return [name, formatDate(String(raw), i18n.language)];
				return [name, raw];
			})
		);

	return {
		target: ({ key, params }: Explanation) =>
			t(`explain.${key}` as 'explain.target.workday', {
				...words(params),
				defaultValue: t('explain.unknown')
			}),
		finding: (code: ArbzgCode, facts: Explanation['params']) => t(`finding.${code}`, words(facts))
	};
}
