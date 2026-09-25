import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/ui/empty-state';
import { Notice } from '../../components/ui/notice';
import { LoadError, Loading } from '../../components/ui/states';
import page from '../absences/ui/page.module.css';
import { PeriodStepper } from '../absences/ui/period-stepper';
import { vacationQuery } from './api';
import { BucketTable } from './bucket-table';
import { ForfeitureNotice } from './forfeiture-notice';
import styles from './vacation.module.css';

type Props = {
	employeeId: string | null;
	year: number;
	onYear: (year: number) => void;
};

export function VacationPage({ employeeId, year, onYear }: Props) {
	const { t } = useTranslation('vacation');
	const account = useQuery(vacationQuery(employeeId, year));
	const [acknowledged, setAcknowledged] = useState(false);

	const body = () => {
		if (!employeeId) return <Notice>{t('errors.noEmployee')}</Notice>;
		if (account.isPending) return <Loading rows={4} />;
		if (account.isError) {
			return <LoadError error={account.error} onRetry={() => void account.refetch()} />;
		}
		const { buckets } = account.data;
		const open = buckets.flatMap((bucket) =>
			bucket.notice && !bucket.notice.acknowledgedAt ? [{ bucket, notice: bucket.notice }] : []
		);
		return (
			<>
				{acknowledged && <Notice tone="success">{t('forfeiture.done')}</Notice>}
				{open.map(({ bucket, notice }) => (
					<ForfeitureNotice
						key={notice.id}
						bucket={bucket}
						notice={notice}
						onAcknowledged={() => setAcknowledged(true)}
					/>
				))}
				<section aria-labelledby="leave-account" className={page.section}>
					<h2 id="leave-account">{t('account.title')}</h2>
					{buckets.length === 0 ? (
						<EmptyState title={t('account.empty', { year })} />
					) : (
						<BucketTable key={year} account={account.data} />
					)}
				</section>
				<p className={styles.legal}>{t('legal')}</p>
			</>
		);
	};

	return (
		<div className={page.page}>
			<header className={page.head}>
				<h1>{t('title')}</h1>
				{employeeId && (
					<PeriodStepper
						label={t('year')}
						previousLabel={t('prevYear')}
						nextLabel={t('nextYear')}
						onPrevious={() => onYear(year - 1)}
						onNext={() => onYear(year + 1)}
					>
						<span className={styles.stepYear}>{year}</span>
					</PeriodStepper>
				)}
			</header>
			{body()}
		</div>
	);
}
