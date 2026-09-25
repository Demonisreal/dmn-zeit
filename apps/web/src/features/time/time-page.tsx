import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { hasRole, type Session } from '@zeit/shared';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Skeleton } from '../../components/ui/skeleton';
import { LoadError, Loading } from '../../components/ui/states';
import { formatDate, formatMinutes, formatMonth } from '../../i18n/format';
import { daysQuery, flexQuery } from '../week/api';
import { lastOfMonth, shiftMonth, todayIso } from '../week/dates';
import { DayTable } from '../week/day-table';
import styles from '../week/page.module.css';
import { PeriodNav } from '../week/period-nav';
import { FlexDerivation } from '../week/week-page';
import { AckForm } from './ack-form';

type Props = {
	session: Session;
	month: string | undefined;
	employee: string | undefined;
	day: string | undefined;
};

export function TimePage({ session, month, employee, day }: Props) {
	const { t, i18n } = useTranslation(['time', 'week', 'nav']);
	const navigate = useNavigate();
	const current = todayIso().slice(0, 7);
	const shown = month ?? day?.slice(0, 7) ?? current;
	const employeeId = employee ?? session.user.employeeId;

	return (
		<div className={styles.page}>
			<header className={styles.head}>
				<VisuallyHidden elementType="h1">{t('nav:time')}</VisuallyHidden>
				<PeriodNav
					label={formatMonth(shown, i18n.language)}
					previous={t('previous')}
					next={t('next')}
					current={t('current')}
					isCurrent={shown === current}
					onStep={(by) =>
						void navigate({
							to: '/time',
							search: (prev) => ({ ...prev, month: shiftMonth(shown, by), day: undefined })
						})
					}
					onReset={() =>
						void navigate({ to: '/time', search: (prev) => ({ employee: prev.employee }) })
					}
				/>
			</header>
			{employeeId ? (
				<Month
					employeeId={employeeId}
					month={shown}
					day={day}
					own={employeeId === session.user.employeeId}
					canAck={employeeId !== session.user.employeeId && hasRole(session.user.role, 'team_lead')}
					isDemo={session.mode === 'demo'}
				/>
			) : (
				<EmptyState title={t('week:noEmployee.title')}>{t('week:noEmployee.text')}</EmptyState>
			)}
		</div>
	);
}

type MonthProps = {
	employeeId: string;
	month: string;
	day: string | undefined;
	own: boolean;
	canAck: boolean;
	isDemo: boolean;
};

function Month({ employeeId, month, day, own, canAck, isDemo }: MonthProps) {
	const { t, i18n } = useTranslation(['time', 'week']);
	const lng = i18n.language;
	const days = useQuery({
		...daysQuery(employeeId, `${month}-01`, lastOfMonth(month)),
		placeholderData: keepPreviousData
	});
	const flex = useQuery(flexQuery(employeeId, Number(month.slice(0, 4))));

	if (!days.data) {
		return days.isError ? (
			<LoadError error={days.error} onRetry={() => void days.refetch()} />
		) : (
			<Loading rows={10} />
		);
	}

	const flexMonth = flex.data?.months.find((entry) => entry.month === month);
	const balance = flex.isPending ? (
		<Skeleton width="4.5rem" />
	) : flex.isError ? (
		<Button variant="quiet" onPress={() => void flex.refetch()}>
			{t('week:flexRetry')}
		</Button>
	) : (
		flexMonth && (
			<>
				{formatMinutes(flexMonth.balanceMinutes, { signed: true })}
				<span className={styles.caption}>
					{month === todayIso().slice(0, 7)
						? t('week:asOf', { date: formatDate(flex.data.asOf, lng) })
						: t('monthEnd', { month: formatMonth(month, lng) })}
				</span>
			</>
		)
	);

	return (
		<>
			<DayTable
				label={t('table', { month: formatMonth(month, lng) })}
				range={days.data}
				fetchedAt={days.dataUpdatedAt}
				totalLabel={t('total')}
				balance={balance}
				balanceDetail={
					flex.isSuccess && flexMonth && <FlexDerivation flex={flex.data} through={month} />
				}
				own={own}
				openDay={day}
				findingAction={
					canAck
						? (day, finding) => (
								<AckForm employeeId={employeeId} date={day.date} finding={finding} />
							)
						: undefined
				}
				isStale={days.isPlaceholderData}
				isDemo={isDemo}
			/>
			{days.data.days.every((day) => day.entries.length === 0) && (
				<p className={styles.hint}>{t('empty')}</p>
			)}
		</>
	);
}
