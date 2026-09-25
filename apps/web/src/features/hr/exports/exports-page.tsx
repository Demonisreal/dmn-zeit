import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Page, PageHead } from '../../../components/ui/page-shell';
import { SelectField } from '../../../components/ui/select-field';
import { LoadError } from '../../../components/ui/states';
import { formatMonth } from '../../../i18n/format';
import { currentMonth } from '../../../lib/dates';
import { employeesQuery, withSearch } from '../api';
import { monthsBack } from '../dates';
import { HrNav } from '../hr-nav';
import { employeeOptions } from '../people/employee-options';
import styles from '../ui/page.module.css';
import { MonthOverview } from './month-overview';

type Props = {
	month: string;
	employeeId: string | undefined;
	onChange: (next: { month?: string | undefined; employee?: string | undefined }) => void;
};

export function ExportsPage({ month, employeeId, onChange }: Props) {
	const { t, i18n } = useTranslation('hr');
	const employees = useQuery(employeesQuery(true));
	const months = monthsBack(currentMonth(), 12).map((id) => ({
		id,
		label: formatMonth(id, i18n.language)
	}));

	return (
		<>
			<HrNav />
			<Page>
				<PageHead>
					<div>
						<h1>{t('exports.title')}</h1>
						<p className={styles.lead}>{t('exports.lead')}</p>
						<p id="csv-hint" className={`${styles.lead} ${styles.small}`}>
							{t('exports.csvHint')}
						</p>
					</div>
				</PageHead>
				<div className={styles.filters}>
					<SelectField
						label={t('exports.month')}
						options={months}
						value={month}
						onChange={(key) => onChange({ month: String(key) })}
					/>
				</div>

				<section className={styles.section} aria-labelledby="timesheet">
					<div>
						<h2 id="timesheet">{t('exports.timesheet')}</h2>
						<p className={styles.lead}>{t('exports.timesheetLead')}</p>
					</div>
					{employees.isError && (
						<LoadError error={employees.error} onRetry={() => void employees.refetch()} />
					)}
					<div className={styles.filters}>
						<SelectField
							label={t('exports.employee')}
							placeholder={t('choose')}
							options={employeeOptions(employees.data ?? [], i18n.language)}
							value={employeeId ?? null}
							onChange={(key) => onChange({ employee: key === null ? undefined : String(key) })}
						/>
					</div>
					{employeeId ? (
						<p className={styles.actions}>
							<a
								href={withSearch('/api/exports/timesheet', {
									employee: employeeId,
									month,
									format: 'csv'
								})}
								download
								aria-describedby="csv-hint"
							>
								{t('exports.csv')}
							</a>
							<Link to="/print/timesheet/$id/$month" params={{ id: employeeId, month }}>
								{t('exports.print')}
							</Link>
						</p>
					) : (
						<p className={`${styles.small} ${styles.muted}`}>{t('exports.chooseEmployee')}</p>
					)}
				</section>

				<section className={styles.section} aria-labelledby="overview">
					<div className={styles.sectionHead}>
						<h2 id="overview">{t('exports.overview')}</h2>
						<a
							href={withSearch('/api/exports/month-overview', { month, format: 'csv' })}
							download
							aria-describedby="csv-hint"
						>
							{t('exports.csv')}
						</a>
					</div>
					<MonthOverview month={month} />
				</section>
			</Page>
		</>
	);
}
