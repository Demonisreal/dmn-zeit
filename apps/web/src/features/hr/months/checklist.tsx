import { Link } from '@tanstack/react-router';
import type { MonthChecklist } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { Tag } from '../../../components/ui/tag';
import styles from '../ui/page.module.css';
import css from './checklist.module.css';

type Props = {
	items: MonthChecklist['items'];
	closed: boolean;
};

export function Checklist({ items, closed }: Props) {
	const { t } = useTranslation('hr');
	// blocking points first, they are the ones that stop the close
	const sorted = items.toSorted((a, b) => Number(b.blocking) - Number(a.blocking));

	return (
		<section className={styles.section} aria-labelledby="checklist">
			<h2 id="checklist">{t('months.checklistTitle')}</h2>
			{sorted.length === 0 ? (
				<p className={styles.muted}>{closed ? t('months.nothingClosed') : t('months.nothing')}</p>
			) : (
				<ul className={css.items}>
					{sorted.map((item) => (
						<li key={item.kind} className={css.item}>
							<Tag tone={item.blocking ? 'error' : 'neutral'}>
								{item.blocking ? t('months.blocking') : t('months.notBlocking')}
							</Tag>
							<div className={css.text}>
								<p className={css.title}>{t(`months.checklist.${item.kind}`)}</p>
								<p className={`${styles.small} ${styles.muted}`}>
									{t(`months.checklistHint.${item.kind}`)}
								</p>
								{item.employees.length > 0 && (
									<ul className={css.people} aria-label={t('months.affected')}>
										{item.employees.map((employee) => (
											<li key={employee.id}>
												<Link to="/hr/people/$id" params={{ id: employee.id }}>
													{employee.name}
												</Link>
											</li>
										))}
									</ul>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
