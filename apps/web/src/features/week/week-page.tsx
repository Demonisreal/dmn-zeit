import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { FlexAccount, Session } from '@zeit/shared';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Page, PageHead } from '../../components/ui/page-shell';
import { PeriodNav } from '../../components/ui/period-nav';
import { Skeleton } from '../../components/ui/skeleton';
import { LoadError, Loading } from '../../components/ui/states';
import { formatDate, formatMinutes } from '../../i18n/format';
import { todayIso } from '../../lib/dates';
import { FlexBookings, FlexMonths } from '../hr/flex/flex-tables';
import { Accounts } from './accounts';
import { daysQuery, flexQuery } from './api';
import { ClockPanel } from './clock-panel';
import { addDays, isoWeek, mondayOf, shortDate } from './dates';
import detail from './day-detail.module.css';
import { DayTable } from './day-table';
import styles from './page.module.css';

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
	const label = t('label', { week: number });
	const { employeeId } = session.user;

	return (
		<Page>
			<PageHead className={styles.head}>
				<VisuallyHidden elementType="h1">{t('nav:week')}</VisuallyHidden>
				<PeriodNav
					variant="title"
					label={label}
					range={t('range', {
						from: shortDate(monday, i18n.language),
						to: formatDate(addDays(monday, 6), i18n.language)
					})}
					previous={t('previous')}
					next={t('next')}
					onStep={(by) => void navigate({ to: '/', search: { week: addDays(monday, by * 7) } })}
					action={
						monday !== mondayOf(today) && (
							<Button variant="secondary" onPress={() => void navigate({ to: '/', search: {} })}>
								{t('current')}
							</Button>
						)
					}
				>
					{label}
				</PeriodNav>
				{employeeId && (
					<div className={styles.clock}>
						<ClockPanel />
					</div>
				)}
			</PageHead>
			{employeeId ? (
				<Week
					employeeId={employeeId}
					monday={monday}
					number={number}
					isDemo={session.mode === 'demo'}
				/>
			) : (
				<EmptyState title={t('noEmployee.title')}>{t('noEmployee.text')}</EmptyState>
			)}
		</Page>
	);
}

type WeekProps = {
	employeeId: string;
	monday: string;
	number: number;
	isDemo: boolean;
};

function Week({ employeeId, monday, number, isDemo }: WeekProps) {
	const { t, i18n } = useTranslation('week');
	const today = todayIso();
	const days = useQuery({
		...daysQuery(employeeId, monday, addDays(monday, 6)),
		placeholderData: keepPreviousData
	});
	const flex = useQuery(flexQuery(employeeId, Number(today.slice(0, 4))));

	if (!days.data) {
		return days.isError ? (
			<LoadError error={days.error} onRetry={() => void days.refetch()} />
		) : (
			<Loading rows={7} />
		);
	}

	const range = days.data;
	const untouched = range.days.every((day) => day.entries.length === 0);
	const balance = flex.isPending ? (
		<Skeleton width="4.5rem" />
	) : flex.isError ? (
		<Button variant="quiet" onPress={() => void flex.refetch()}>
			{t('flexRetry')}
		</Button>
	) : (
		<>
			{formatMinutes(flex.data.balanceMinutes, { signed: true })}
			<span className={styles.caption}>
				{t('asOf', { date: formatDate(flex.data.asOf, i18n.language) })}
			</span>
		</>
	);

	return (
		<>
			<DayTable
				label={t('table', { week: number })}
				range={range}
				fetchedAt={days.dataUpdatedAt}
				totalLabel={t('total')}
				balance={balance}
				balanceDetail={
					flex.isSuccess && <FlexDerivation flex={flex.data} through={flex.data.asOf.slice(0, 7)} />
				}
				own
				isStale={days.isPlaceholderData}
				isDemo={isDemo}
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

type DerivationProps = {
	flex: FlexAccount;
	through: string;
};

export function FlexDerivation({ flex, through }: DerivationProps) {
	const { t, i18n } = useTranslation(['week', 'hr']);
	const months = flex.months.filter((month) => month.month <= through);
	const bookings = flex.bookings.filter(
		(booking) => booking.effectiveDate <= flex.asOf && booking.effectiveDate.slice(0, 7) <= through
	);
	const opening = flex.openingExplanation;
	const carried = opening.key === 'flex.opening.carryover' ? Number(opening.params.minutes) : null;
	const types = [
		...new Set(
			bookings.filter((booking) => booking.type !== 'opening').map((booking) => booking.type)
		)
	];
	const monthName = (month: string) =>
		formatDate(`${month}-01`, i18n.language, { day: undefined, month: 'long', year: undefined });
	const first = months[0];
	const last = months.at(-1);

	return (
		<div className={detail.detail}>
			<section className={detail.block}>
				<h3>{t('detail.calc')}</h3>
				<dl className={detail.calc}>
					<div>
						<dt>
							<span aria-hidden="true" />
							{t('flexDetail.opening')}
						</dt>
						<dd>
							<span className={detail.amount}>
								{formatMinutes(flex.openingMinutes, { signed: true })}
							</span>
							{carried === null && (
								<span className={detail.hint}>{t('hr:explain.flex.opening.none')}</span>
							)}
						</dd>
					</div>
					{carried !== null && (
						<div>
							<dt>
								<span aria-hidden="true">+</span>
								{t('flexDetail.carryover')}
							</dt>
							<dd>
								<span className={detail.amount}>{formatMinutes(carried, { signed: true })}</span>
								<span className={detail.hint}>{t('flexDetail.carryoverHint')}</span>
							</dd>
						</div>
					)}
					<div>
						<dt>
							<span aria-hidden="true">+</span>
							{t('flexDetail.months')}
						</dt>
						<dd>
							<span className={detail.amount}>
								{formatMinutes(
									months.reduce((sum, month) => sum + month.diffMinutes, 0),
									{ signed: true }
								)}
							</span>
							{first && last && (
								<span className={detail.hint}>
									{first === last
										? monthName(first.month)
										: t('detail.span', { from: monthName(first.month), to: monthName(last.month) })}
								</span>
							)}
						</dd>
					</div>
					<div>
						<dt>
							<span aria-hidden="true">+</span>
							{t('flexDetail.bookings')}
						</dt>
						<dd>
							<span className={detail.amount}>
								{formatMinutes(
									months.reduce((sum, month) => sum + month.bookedMinutes, 0),
									{ signed: true }
								)}
							</span>
							{types.length > 0 && (
								<span className={detail.hint}>
									{types.map((type) => t(`hr:flex.types.${type}`)).join(', ')}
								</span>
							)}
						</dd>
					</div>
					<div className={detail.result}>
						<dt>
							<span aria-hidden="true">=</span>
							{t('flexDetail.balance')}
						</dt>
						<dd>
							<span className={detail.amount}>
								{formatMinutes(last?.balanceMinutes ?? flex.balanceMinutes, { signed: true })}
							</span>
						</dd>
					</div>
				</dl>
			</section>

			{months.length > 0 && (
				<section className={`${detail.block} ${detail.wide}`}>
					<h3>{t('hr:flex.months')}</h3>
					<FlexMonths months={months} />
				</section>
			)}
			{bookings.length > 0 && (
				<section className={`${detail.block} ${detail.wide}`}>
					<h3>{t('hr:flex.bookings')}</h3>
					<FlexBookings bookings={bookings} />
				</section>
			)}
		</div>
	);
}
