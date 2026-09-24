import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../../components/ui/empty-state';
import { Notice } from '../../../components/ui/notice';
import { Table } from '../../../components/ui/table';
import { formatDays, formatMinutes } from '../../../i18n/format';
import { monthOverviewQuery } from '../api';
import { Loading, LoadError } from '../ui/states';
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
			<div className={styles.scroll}>
				<Table label={t('exports.overview')}>
					<thead>
						<tr>
							<th scope="col">{t('people.personnelNo')}</th>
							<th scope="col">{t('people.name')}</th>
							<th scope="col" data-numeric>
								{t('flex.target')}
							</th>
							<th scope="col" data-numeric>
								{t('flex.worked')}
							</th>
							<th scope="col" data-numeric>
								{t('flex.credited')}
							</th>
							<th scope="col" data-numeric>
								{t('flex.diff')}
							</th>
							<th scope="col" data-numeric>
								{t('flex.balance')}
							</th>
							<th scope="col" data-numeric>
								{t('exports.vacationDays')}
							</th>
							<th scope="col" data-numeric>
								{t('exports.sickDays')}
							</th>
							<th scope="col" data-numeric>
								{t('exports.openFindings')}
							</th>
						</tr>
					</thead>
					<tbody>
						{overview.data.rows.map((row) => (
							<tr key={row.employee.id}>
								<td className={styles.mono}>{row.employee.personnelNo}</td>
								<td>{row.employee.name}</td>
								<td data-numeric>{formatMinutes(row.targetMinutes)}</td>
								<td data-numeric>{formatMinutes(row.workedMinutes)}</td>
								<td data-numeric>{formatMinutes(row.creditedMinutes)}</td>
								<td data-numeric>{formatMinutes(row.diffMinutes, { signed: true })}</td>
								<td data-numeric>{formatMinutes(row.flexBalanceMinutes, { signed: true })}</td>
								<td data-numeric>{formatDays(row.vacationDays, i18n.language)}</td>
								<td data-numeric>{formatDays(row.sickDays, i18n.language)}</td>
								<td data-numeric>{row.openFindings}</td>
							</tr>
						))}
					</tbody>
				</Table>
			</div>
		</>
	);
}
