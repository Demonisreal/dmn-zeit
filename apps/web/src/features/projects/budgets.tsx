import { useQuery } from '@tanstack/react-query';
import type { BudgetState } from '@zeit/shared';
import { useId } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { Tag } from '../../components/ui/tag';
import { formatMinutes } from '../../i18n/format';
import { bookableQuery, budgetsQuery } from './api';
import { useExplain } from './explain';
import styles from './summary.module.css';

// the same tones as the ArbZG tags: amber from 80 %, red once it is exceeded
const tones = { ok: 'neutral', warn: 'warning', exceeded: 'error' } as const satisfies Record<
	BudgetState,
	string
>;

export function Budgets() {
	const { t } = useTranslation(['projects', 'common']);
	const titleId = useId();
	const explain = useExplain();
	const budgets = useQuery(budgetsQuery);
	const bookable = useQuery(bookableQuery);
	const clientOf = (id: string) => bookable.data?.find((project) => project.id === id)?.clientName;
	const limited = (budgets.data ?? []).filter((project) => project.budget !== null);

	return (
		<section
			className={styles.section}
			aria-labelledby={titleId}
			aria-busy={budgets.isPending || undefined}
		>
			<h2 id={titleId}>{t('budgets.title')}</h2>
			{budgets.isPending ? (
				<Skeleton width="12rem" />
			) : budgets.isError ? (
				<p className={styles.muted}>
					{t('budgets.loadFailed')}{' '}
					<Button variant="quiet" onPress={() => void budgets.refetch()}>
						{t('common:retry')}
					</Button>
				</p>
			) : limited.length === 0 ? (
				<p className={styles.muted}>{t('budgets.none')}</p>
			) : (
				<ul className={styles.list}>
					{limited.map((project) => {
						const budget = project.budget!;
						const share = Math.round((budget.usedMinutes / budget.minutes) * 100);
						return (
							<li key={project.id}>
								<span className={styles.name}>
									{project.name}
									{clientOf(project.id) && (
										<span className={styles.client}>{clientOf(project.id)}</span>
									)}
								</span>
								<span className={styles.figure} title={explain(budget.explanation)}>
									{t('budgets.used', {
										used: formatMinutes(budget.usedMinutes),
										budget: formatMinutes(budget.minutes)
									})}
								</span>
								<span className={styles.state} title={t(`budgets.state.${budget.state}`)}>
									<Tag tone={tones[budget.state]}>{t('budgets.share', { share })}</Tag>
									<VisuallyHidden elementType="span">
										, {t(`budgets.state.${budget.state}`)}
									</VisuallyHidden>
								</span>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
