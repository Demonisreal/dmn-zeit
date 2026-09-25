import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { formatDays } from '../../i18n/format';
import { todayIso } from '../../lib/dates';
import { vacationQuery } from '../vacation/api';
import { openAbsencesQuery, openCorrectionsQuery } from './api';
import styles from './accounts.module.css';
import { addDays } from './dates';

// only counts and one figure, the full lists live on the requests and leave pages
export function Accounts({ employeeId }: { employeeId: string }) {
	const { t, i18n } = useTranslation(['week', 'common']);
	const requestsId = useId();
	const leaveId = useId();
	const today = todayIso();
	// pending corrections point back, leave requests mostly ahead; the api allows 366 days
	const from = addDays(today, -90);
	const to = addDays(from, 365);
	const absences = useQuery(openAbsencesQuery(from, to));
	const corrections = useQuery(openCorrectionsQuery(from, to));
	const leave = useQuery(vacationQuery(employeeId, Number(today.slice(0, 4))));

	const failed = (retry: () => void) => (
		<p className={styles.failed}>
			{t('loadFailed')}{' '}
			<Button variant="quiet" onPress={retry}>
				{t('common:retry')}
			</Button>
		</p>
	);

	const requestsPending = absences.isPending || corrections.isPending;
	const absenceCount = absences.data?.items.length ?? 0;
	const correctionCount = corrections.data?.items.length ?? 0;

	return (
		<div className={styles.accounts}>
			<section aria-labelledby={requestsId} aria-busy={requestsPending || undefined}>
				<h2 id={requestsId}>{t('requests.title')}</h2>
				{requestsPending ? (
					<Skeleton width="10rem" />
				) : absences.isError || corrections.isError ? (
					failed(() => {
						void absences.refetch();
						void corrections.refetch();
					})
				) : absenceCount + correctionCount === 0 ? (
					<p className={styles.muted}>{t('requests.none')}</p>
				) : (
					<ul className={styles.counts}>
						{absenceCount > 0 && <li>{t('requests.absences', { count: absenceCount })}</li>}
						{correctionCount > 0 && (
							<li>{t('requests.corrections', { count: correctionCount })}</li>
						)}
					</ul>
				)}
				<Link to="/absences" className={styles.link}>
					{t('requests.link')}
				</Link>
			</section>

			<section aria-labelledby={leaveId} aria-busy={leave.isPending || undefined}>
				<h2 id={leaveId}>{t('leave.title')}</h2>
				{leave.isPending ? (
					<Skeleton width="8rem" />
				) : leave.isError ? (
					failed(() => void leave.refetch())
				) : (
					<>
						<p className={styles.figure}>
							<span className={styles.number}>
								{formatDays(leave.data.available, i18n.language)}
							</span>
							{t('leave.available')}
						</p>
						{Number(leave.data.pending) > 0 && (
							<p className={styles.muted}>
								{t('leave.pending', { days: formatDays(leave.data.pending, i18n.language) })}
							</p>
						)}
					</>
				)}
				<Link to="/vacation" className={styles.link}>
					{t('leave.link')}
				</Link>
			</section>
		</div>
	);
}
