import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../../components/ui/empty-state';
import { Notice } from '../../../components/ui/notice';
import { Loading, LoadError } from '../../../components/ui/states';
import { Table } from '../../../components/ui/table';
import { formatDays, formatMinutes } from '../../../i18n/format';
import { monthOverviewQuery } from '../api';
import styles from '../ui/page.module.css';

export function MonthOverview({ month }: { month: string }) {
	const { t, i18n } = useTranslation('hr');
	const overview = useQuery(monthOverviewQuery(month));

	if (overview.isError) {
		return <LoadError error={overview.error} onRetry={() => void overview.refetch()} />;
	}
	if (!overview.data) return <Loading rows={6} />;
	if (overview.data.rows.length === 0) return <EmptyState title={t('exports.noRows')} />;

	return (
		<>
			{!overview.data.closed && <Notice tone="warning">{t('exports.notClosed')}</Notice>}
			<div className={styles.scroll} role="region" aria-label={t('exports.overview')} tabIndex={0}>
				<Table label={t('exports.overview')}>
					<thead>
						<tr>
							<th scope="col" className={styles.colWide}>
								{t('people.personnelNo')}
							</th>
							<th scope="col">{t('people.name')}</th>
							<th scope="col" data-numeric className={styles.colMid}>
								{t('flex.target')}
							</th>
							<th scope="col" data-numeric className={styles.colMid}>
								{t('flex.worked')}
							</th>
							<th scope="col" data-numeric className={styles.colWide}>
								{t('flex.credited')}
							</th>
							<th scope="col" data-numeric>
								{t('flex.diff')}
							</th>
							<th scope="col" data-numeric>
								{t('flex.balance')}
							</th>
							<th scope="col" data-numeric className={styles.colWide}>
								{t('exports.vacationDays')}
							</th>
							<th scope="col" data-numeric className={styles.colWide}>
								{t('exports.sickDays')}
							</th>
							<th scope="col" data-numeric className={styles.colMid}>
								{t('exports.openFindings')}
							</th>
						</tr>
					</thead>
					<tbody>
						{overview.data.rows.map((row) => (
							<tr key={row.employee.id}>
								<td className={`${styles.mono} ${styles.colWide}`}>{row.employee.personnelNo}</td>
								<td>
									<Link to="/time" search={{ employee: row.employee.id, month }}>
										{row.employee.name}
									</Link>
								</td>
								<td data-numeric className={styles.colMid}>
									{formatMinutes(row.targetMinutes)}
								</td>
								<td data-numeric className={styles.colMid}>
									{formatMinutes(row.workedMinutes)}
								</td>
								<td data-numeric className={styles.colWide}>
									{formatMinutes(row.creditedMinutes)}
								</td>
								<td data-numeric>{formatMinutes(row.diffMinutes, { signed: true })}</td>
								<td data-numeric>{formatMinutes(row.flexBalanceMinutes, { signed: true })}</td>
								<td data-numeric className={styles.colWide}>
									{formatDays(row.vacationDays, i18n.language)}
								</td>
								<td data-numeric className={styles.colWide}>
									{formatDays(row.sickDays, i18n.language)}
								</td>
								<td data-numeric className={styles.colMid}>
									{row.openFindings}
								</td>
							</tr>
						))}
					</tbody>
				</Table>
			</div>
		</>
	);
}
