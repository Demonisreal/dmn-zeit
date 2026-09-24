import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Notice } from '../../../components/ui/notice';
import { Table } from '../../../components/ui/table';
import { formatDate } from '../../../i18n/format';
import { currentYear, formatInstant } from '../../hr/dates';
import { Loading, LoadError } from '../../hr/ui/states';
import styles from '../../hr/ui/page.module.css';
import { AdminNav } from '../admin-nav';
import { holidaysQuery, tenantQuery } from '../api';
import { TenantForm } from './tenant-form';
import css from './tenant-page.module.css';

export function TenantPage() {
	const { t, i18n } = useTranslation('admin');
	const year = currentYear();
	const tenant = useQuery(tenantQuery);
	const holidays = useQuery(holidaysQuery(year));

	let form;
	if (tenant.isError) {
		form = <LoadError error={tenant.error} onRetry={() => void tenant.refetch()} />;
	} else if (!tenant.data) {
		form = <Loading rows={6} />;
	} else {
		form = (
			<>
				{tenant.data.kind === 'sandbox' && tenant.data.expiresAt && (
					<Notice>
						{t('tenant.sandbox', { at: formatInstant(tenant.data.expiresAt, i18n.language) })}
					</Notice>
				)}
				<TenantForm tenant={tenant.data} />
			</>
		);
	}

	let list;
	if (holidays.isError) {
		list = <LoadError error={holidays.error} onRetry={() => void holidays.refetch()} />;
	} else if (!holidays.data) {
		list = <Loading rows={6} />;
	} else {
		list = (
			<Table label={t('tenant.holidays', { year })}>
				<thead>
					<tr>
						<th scope="col">{t('tenant.date')}</th>
						<th scope="col">{t('tenant.holiday')}</th>
						<th scope="col">{t('tenant.portion')}</th>
					</tr>
				</thead>
				<tbody>
					{holidays.data.map((holiday) => (
						<tr key={holiday.date}>
							<td className={styles.mono}>
								{formatDate(holiday.date, i18n.language, { weekday: 'short' })}
							</td>
							<td>{t(`holidays.${holiday.code}`)}</td>
							<td className={styles.muted}>
								{holiday.portion === 0.5 ? t('tenant.halfDay') : t('tenant.fullDay')}
							</td>
						</tr>
					))}
				</tbody>
			</Table>
		);
	}

	return (
		<>
			<AdminNav />
			<div className={styles.page}>
				<header className={styles.head}>
					<div>
						<h1>{t('tenant.title')}</h1>
						<p className={styles.lead}>{t('tenant.lead')}</p>
					</div>
				</header>
				<div className={css.layout}>
					<div className={styles.section}>{form}</div>
					<section className={styles.section} aria-labelledby="holidays">
						<div>
							<h2 id="holidays">{t('tenant.holidays', { year })}</h2>
							<p className={styles.lead}>{t('tenant.holidaysLead')}</p>
						</div>
						{list}
					</section>
				</div>
			</div>
		</>
	);
}
