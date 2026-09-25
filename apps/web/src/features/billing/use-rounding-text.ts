import type { RoundingMode } from '@zeit/shared';
import { useTranslation } from 'react-i18next';

type Owner = { roundingIncrementMin: number | null; roundingMode: RoundingMode | null };

// increment and mode fall back one by one, so each half can read "as above"
export function useRoundingText(inheritLabel: string) {
	const { t } = useTranslation('billing');
	return ({ roundingIncrementMin, roundingMode }: Owner) =>
		roundingIncrementMin === null && roundingMode === null
			? inheritLabel
			: t('rounding.summary', {
					increment:
						roundingIncrementMin === null
							? inheritLabel
							: t('rounding.minutes', { minutes: roundingIncrementMin }),
					mode: roundingMode === null ? inheritLabel : t(`rounding.modes.${roundingMode}`)
				});
}
