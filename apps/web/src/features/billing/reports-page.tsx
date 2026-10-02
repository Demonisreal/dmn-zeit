import { useQuery } from '@tanstack/react-query';
import type { Role } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadError } from '../../components/ui/states';
import { Page, PageHead } from '../../components/ui/page-shell';
import { SelectField } from '../../components/ui/select-field';
import { DateInputField } from '../hr/ui/date-field';
import styles from '../hr/ui/page.module.css';
import { clientsQuery, timeReportUrl } from './api';
import { BillingNav } from './billing-nav';

const all = 'all';

export type ReportsFilter = { client: string | undefined; from: string; to: string };

type Props = {
	role: Role;
	filter: ReportsFilter;
	onFilter: (next: Partial<ReportsFilter>) => void;
};

export function ReportsPage({ role, filter, onFilter }: Props) {
	const { t } = useTranslation('billing');
	const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
	const clients = useQuery(clientsQuery);

	const rangeProblem =
		filter.from > filter.to
			? t('reports.rangeUnordered')
			: (Date.parse(filter.to) - Date.parse(filter.from)) / 86_400_000 + 1 > 366
				? t('reports.rangeTooLong')
				: undefined;

	return (
		<>
			<BillingNav role={role} />
			<Page>
				<PageHead>
					<div>
						<h1>{t('reports.title')}</h1>
						<p className={styles.lead}>{t('reports.lead')}</p>
					</div>
				</PageHead>

				{clients.isError && (
					<LoadError error={clients.error} onRetry={() => void clients.refetch()} />
				)}

				<section className={styles.section} aria-label={t('reports.title')}>
					<div className={styles.filters}>
						<SelectField
							label={t('reports.client')}
							options={[
								{ id: all, label: t('reports.allClients') },
								...(clients.data ?? []).map((client) => ({ id: client.id, label: client.name }))
							]}
							value={filter.client ?? all}
							onChange={(key) => onFilter({ client: key === all ? undefined : String(key) })}
						/>
						<div className={styles.range}>
							<DateInputField
								label={t('from')}
								value={filter.from}
								onChange={(from) => from && onFilter({ from })}
							/>
							<DateInputField
								label={t('to')}
								value={filter.to}
								onChange={(to) => to && onFilter({ to })}
								error={rangeProblem}
							/>
						</div>
						<SelectField
							label={t('reports.format')}
							options={[
								{ id: 'pdf', label: t('reports.pdf') },
								{ id: 'csv', label: t('reports.csv') }
							]}
							value={format}
							onChange={(key) => setFormat(key === 'csv' ? 'csv' : 'pdf')}
						/>
					</div>

					{rangeProblem ? (
						<p className={`${styles.small} ${styles.muted}`}>{rangeProblem}</p>
					) : (
						<p className={styles.actions}>
							<a
								href={timeReportUrl({
									client: filter.client,
									from: filter.from,
									to: filter.to,
									format
								})}
								download
							>
								{t('reports.download')}
							</a>
						</p>
					)}
				</section>
			</Page>
		</>
	);
}
