import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Session } from '@zeit/shared';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Skeleton } from '../../components/ui/skeleton';
import { formatDate, formatMinutes } from '../../i18n/format';
import { Accounts } from './accounts';
import { daysQuery, flexQuery } from './api';
import { ClockPanel } from './clock-panel';
import { addDays, isoWeek, mondayOf, shortDate, todayIso } from './dates';
import { DayTable } from './day-table';
import styles from './page.module.css';
import { PeriodNav } from './period-nav';
import { LoadError, TableLoading } from './states';

type Props = {
	session: Session;
	week: string | undefined;
};

export function WeekPage({ session, week }: Props) {
	const { t, i18n } = useTranslation(['week', 'nav']);
	const navigate = useNavigate();
	const today = todayIso();
	const monday = mondayOf(week ?? today);
	const number = isoWeek(monday);
	const { employeeId } = session.user;

	return (
		<div className={styles.page}>
			<header className={styles.head}>
				<VisuallyHidden elementType="h1">{t('nav:week')}</VisuallyHidden>
				<PeriodNav
					label={t('label', { week: number })}
					range={t('range', {
						from: shortDate(monday, i18n.language),
						to: formatDate(addDays(monday, 6), i18n.language)
					})}
					previous={t('previous')}
					next={t('next')}
					current={t('current')}
					isCurrent={monday === mondayOf(today)}
					onStep={(by) => void navigate({ to: '/', search: { week: addDays(monday, by * 7) } })}
					onReset={() => void navigate({ to: '/', search: {} })}
				/>
				{employeeId && <ClockPanel />}
			</header>
			{employeeId ? (
				<Week employeeId={employeeId} monday={monday} number={number} />
			) : (
				<EmptyState title={t('noEmployee.title')}>{t('noEmployee.text')}</EmptyState>
			)}
		</div>
	);
}

type WeekProps = {
	employeeId: string;
	monday: string;
	number: number;
};

function Week({ employeeId, monday, number }: WeekProps) {
	const { t } = useTranslation('week');
	const today = todayIso();
	const days = useQuery({
		...daysQuery(employeeId, monday, addDays(monday, 6)),
		placeholderData: keepPreviousData
	});

	if (!days.data) {
		return days.isError ? (
			<LoadError error={days.error} onRetry={() => void days.refetch()} />
		) : (
			<TableLoading rows={7} />
		);
	}

	const range = days.data;
	const untouched = range.days.every((day) => day.entries.length === 0);

	return (
		<>
			<DayTable
				label={t('table', { week: number })}
				range={range}
				fetchedAt={days.dataUpdatedAt}
				totalLabel={t('total')}
				balance={<FlexBalance employeeId={employeeId} />}
				canCorrect
				isStale={days.isPlaceholderData}
			/>
			{untouched && (
				<p className={styles.hint}>
					{t(range.from <= today && today <= range.to ? 'emptyCurrent' : 'empty')}
				</p>
			)}
			<Accounts employeeId={employeeId} />
		</>
	);
}

// the balance of the running year as the api counts it, nothing is added up here
function FlexBalance({ employeeId }: { employeeId: string }) {
	const { t, i18n } = useTranslation('week');
	const flex = useQuery(flexQuery(employeeId, Number(todayIso().slice(0, 4))));

	if (flex.isPending) return <Skeleton width="4.5rem" />;
	if (flex.isError) {
		return (
			<Button variant="quiet" onPress={() => void flex.refetch()}>
				{t('flexRetry')}
			</Button>
		);
	}
	return (
		<>
			{formatMinutes(flex.data.balanceMinutes, { signed: true })}
			<span className={styles.caption}>
				{t('asOf', { date: formatDate(flex.data.asOf, i18n.language) })}
			</span>
		</>
	);
}
