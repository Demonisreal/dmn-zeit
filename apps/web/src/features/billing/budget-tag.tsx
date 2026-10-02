import type { BudgetState, BudgetStatus } from '@zeit/shared';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Tag } from '../../components/ui/tag';

const tones = { ok: 'neutral', warn: 'warning', exceeded: 'error' } as const satisfies Record<
	BudgetState,
	string
>;

export function BudgetTag({ budget }: { budget: BudgetStatus }) {
	const { t } = useTranslation('projects');
	const share = Math.round((budget.usedMinutes / budget.minutes) * 100);
	return (
		<span title={t(`budgets.state.${budget.state}`)}>
			<Tag tone={tones[budget.state]}>{t('budgets.share', { share })}</Tag>
			<VisuallyHidden>, {t(`budgets.state.${budget.state}`)}</VisuallyHidden>
		</span>
	);
}
