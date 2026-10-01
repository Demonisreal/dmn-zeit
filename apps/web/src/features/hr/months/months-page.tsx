import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Page, PageHead } from '../../../components/ui/page-shell';
import { Loading, LoadError } from '../../../components/ui/states';
import { Table } from '../../../components/ui/table';
import { Tag } from '../../../components/ui/tag';
import { formatDate, formatMonth } from '../../../i18n/format';
import { currentMonth, shiftMonth } from '../../../lib/dates';
import { employeesQuery } from '../api';
import { monthsBack } from '../dates';
import { HrNav } from '../hr-nav';
import styles from '../ui/page.module.css';

export function MonthsPage() {
	const { t, i18n } = useTranslation('hr');
	const employees = useQuery(employeesQuery(true));

	let body;
	if (employees.isError) {
		body = <LoadError error={employees.error} onRetry={() => void employees.refetch()} />;
	} else if (!employees.data) {
		body = <Loading rows={6} />;
	} else {
		const closedThrough = employees.data.reduce<string | null>(
			(latest, employee) =>
				employee.closedThrough && (latest === null || employee.closedThrough > latest)
					? employee.closedThrough
					: latest,
			null
		);
		const lastClosed = closedThrough?.slice(0, 7) ?? null;
		const next = lastClosed ? shiftMonth(lastClosed, 1) : null;
		const running = currentMonth();
		const status = (month: string) => {
			if (lastClosed !== null && month <= lastClosed) {
				return <Tag tone="success">{t('months.closed')}</Tag>;
			}
			if (month === next) return t('months.next');
			return (
				<span className={styles.muted}>
					{month === running ? t('months.running') : t('months.open')}
				</span>
			);
		};

		body = (
			<>
				<p className={styles.small}>
					{closedThrough
						? t('months.closedThrough', { date: formatDate(closedThrough, i18n.language) })
						: t('months.neverClosed')}
				</p>
				<Table label={t('months.title')}>
					<thead>
						<tr>
							<th scope="col">{t('months.month')}</th>
							<th scope="col">{t('months.status')}</th>
						</tr>
					</thead>
					<tbody>
						{monthsBack(running, 12).map((month) => (
							<tr key={month} data-current={month === next || undefined}>
								<td>
									<Link to="/hr/months/$month" params={{ month }}>
										{formatMonth(month, i18n.language)}
									</Link>
								</td>
								<td>{status(month)}</td>
							</tr>
						))}
					</tbody>
				</Table>
			</>
		);
	}

	return (
		<>
			<HrNav />
			<Page>
				<PageHead>
					<div>
						<h1>{t('months.title')}</h1>
						<p className={styles.lead}>{t('months.lead')}</p>
					</div>
				</PageHead>
				<section className={styles.section} aria-label={t('months.title')}>
					{body}
				</section>
			</Page>
		</>
	);
}
