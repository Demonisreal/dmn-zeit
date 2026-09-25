import { Link } from '@tanstack/react-router';
import type { ChecklistKind, EmployeeRef, MonthChecklist } from '@zeit/shared';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Tag } from '../../../components/ui/tag';
import { formatMinutes } from '../../../i18n/format';
import { lastDayOf } from '../dates';
import styles from '../ui/page.module.css';
import css from './checklist.module.css';

type Props = {
	checklist: MonthChecklist;
};

export function Checklist({ checklist }: Props) {
	const { t } = useTranslation('hr');
	const { month, closed, items, capPreview } = checklist;
	// blocking points first, they are the ones that stop the close
	const sorted = items.toSorted((a, b) => Number(b.blocking) - Number(a.blocking));

	const itemLink = (kind: ChecklistKind) => {
		if (kind === 'previous_month_open') return <Link to="/hr/months">{t('months.back')}</Link>;
		if (kind !== 'pending_correction' && kind !== 'pending_absence') return null;
		return (
			<Link
				to="/inbox"
				hash={kind === 'pending_correction' ? 'inbox-corrections' : 'inbox-absences'}
			>
				{t('months.toInbox')}
			</Link>
		);
	};

	// the name keeps leading to master data, this one goes where the point gets resolved
	const fix = (kind: ChecklistKind, employee: EmployeeRef) => {
		if (kind === 'running_entry') {
			return (
				<Link to="/time" search={{ employee: employee.id, month }}>
					{t('months.toMonth')}
					<VisuallyHidden>, {employee.name}</VisuallyHidden>
				</Link>
			);
		}
		if (kind === 'open_finding') {
			return (
				<Link
					to="/hr/findings"
					search={{
						employee: employee.id,
						state: 'open',
						from: `${month}-01`,
						to: lastDayOf(month)
					}}
				>
					{t('months.toFindings')}
					<VisuallyHidden>, {employee.name}</VisuallyHidden>
				</Link>
			);
		}
		return null;
	};

	return (
		<section className={styles.section} aria-labelledby="checklist">
			<h2 id="checklist">{t('months.checklistTitle')}</h2>
			{sorted.length === 0 && capPreview.length === 0 ? (
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
									{t(`months.checklistHint.${item.kind}`)} {itemLink(item.kind)}
								</p>
								{item.employees.length > 0 && (
									<ul className={css.people} aria-label={t('months.affected')}>
										{item.employees.map((employee) => {
											const next = fix(item.kind, employee);
											return (
												<li key={employee.id}>
													<Link to="/hr/people/$id" params={{ id: employee.id }}>
														{employee.name}
													</Link>
													{next && (
														<>
															<span className={css.sep} aria-hidden="true">
																·
															</span>
															{next}
														</>
													)}
												</li>
											);
										})}
									</ul>
								)}
							</div>
						</li>
					))}
					{capPreview.length > 0 && (
						<li className={css.item}>
							<Tag>{t('months.notBlocking')}</Tag>
							<div className={css.text}>
								<p className={css.title}>{t('months.capTitle')}</p>
								<p className={`${styles.small} ${styles.muted}`}>{t('months.capHint')}</p>
								<ul className={css.people} aria-label={t('months.affected')}>
									{capPreview.map(({ employee, forfeitedMinutes }) => (
										<li key={employee.id}>
											<Link to="/hr/people/$id" params={{ id: employee.id }}>
												{employee.name}
											</Link>
											<span className={styles.mono}>
												{t(forfeitedMinutes > 0 ? 'months.capForfeited' : 'months.capForgiven', {
													minutes: formatMinutes(Math.abs(forfeitedMinutes))
												})}
											</span>
											<span className={css.sep} aria-hidden="true">
												·
											</span>
											<Link
												to="/hr/flex"
												search={{ employee: employee.id, year: Number(month.slice(0, 4)) }}
											>
												{t('people.toFlex')}
												<VisuallyHidden>, {employee.name}</VisuallyHidden>
											</Link>
										</li>
									))}
								</ul>
							</div>
						</li>
					)}
				</ul>
			)}
		</section>
	);
}
