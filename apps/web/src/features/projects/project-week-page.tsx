import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { hasRole, type Session } from '@zeit/shared';
import { useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Notice } from '../../components/ui/notice';
import { Page, PageHead } from '../../components/ui/page-shell';
import { PeriodNav } from '../../components/ui/period-nav';
import { LoadError, Loading } from '../../components/ui/states';
import { formatDate } from '../../i18n/format';
import { todayIso } from '../../lib/dates';
import { addDays, isoWeek, mondayOf, shortDate } from '../week/dates';
import { bookableQuery, projectWeekQuery, timerQuery } from './api';
import { Budgets } from './budgets';
import { EntryForm } from './entry-form';
import { MatrixTable } from './matrix-table';
import styles from './project-week-page.module.css';
import { TimerControl } from './timer-control';
import { Unbilled } from './unbilled';

type Props = {
	session: Session;
	week: string | undefined;
	onWeek: (week: string | undefined) => void;
};

export function ProjectWeekPage({ session, week, onWeek }: Props) {
	const { t, i18n } = useTranslation(['projects', 'week', 'nav']);
	const today = todayIso();
	const monday = mondayOf(week ?? today);
	const number = isoWeek(monday);
	const label = t('week:label', { week: number });
	const { employeeId } = session.user;

	return (
		<Page>
			<PageHead className={styles.head}>
				<VisuallyHidden elementType="h1">
					{t(session.tenant.workspace === 'solo' ? 'nav:week' : 'nav:projects')}
				</VisuallyHidden>
				<PeriodNav
					variant="title"
					label={label}
					range={t('week:range', {
						from: shortDate(monday, i18n.language),
						to: formatDate(addDays(monday, 6), i18n.language)
					})}
					previous={t('week:previous')}
					next={t('week:next')}
					onStep={(by) => onWeek(addDays(monday, by * 7))}
					action={
						monday !== mondayOf(today) && (
							<Button variant="secondary" onPress={() => onWeek(undefined)}>
								{t('week:current')}
							</Button>
						)
					}
				>
					{label}
				</PeriodNav>
				{employeeId && (
					<div className={styles.timer}>
						<TimerControl workspace={session.tenant.workspace} />
					</div>
				)}
			</PageHead>
			{employeeId ? (
				<Week session={session} employeeId={employeeId} monday={monday} number={number} />
			) : (
				<EmptyState title={t('week:noEmployee.title')}>{t('noEmployee')}</EmptyState>
			)}
		</Page>
	);
}

type WeekProps = {
	session: Session;
	employeeId: string;
	monday: string;
	number: number;
};

function Week({ session, employeeId, monday, number }: WeekProps) {
	const { t } = useTranslation('projects');
	const today = todayIso();
	const hr = hasRole(session.user.role, 'hr');
	const bookable = useQuery(bookableQuery);
	const timer = useQuery(timerQuery);
	const matrix = useQuery({
		...projectWeekQuery(employeeId, monday),
		placeholderData: keepPreviousData,
		refetchInterval: timer.data?.state === 'running' ? 60_000 : false
	});
	const [adding, setAdding] = useState<'idle' | 'form' | 'sent'>('idle');
	const [closed, setClosed] = useState(false);

	if (!matrix.data || !bookable.data) {
		const failed = matrix.error ?? bookable.error;
		return failed ? (
			<LoadError
				error={failed}
				onRetry={() => void Promise.all([matrix.refetch(), bookable.refetch()])}
			/>
		) : (
			<Loading rows={6} />
		);
	}

	const week = matrix.data;
	if (bookable.data.length === 0 && week.rows.length === 0) {
		return hr ? (
			<EmptyState
				title={t('firstRun.title')}
				action={<Link to="/billing/clients">{t('firstRun.action')}</Link>}
			>
				{t('firstRun.text')}
			</EmptyState>
		) : (
			<EmptyState title={t('noProjects.title')}>{t('noProjects.text')}</EmptyState>
		);
	}

	const current = monday <= today && today <= addDays(monday, 6);

	return (
		<>
			<div className={styles.matrix}>
				<MatrixTable
					label={t('table', { week: number })}
					week={week}
					employeeId={employeeId}
					own
					amounts
					coverage={week.coverage}
					empty={t(current ? 'emptyCurrent' : 'empty')}
					isStale={matrix.isPlaceholderData}
				/>
				{week.coverage && <p className={styles.legend}>{t('coverage.legend')}</p>}
			</div>
			{adding === 'form' ? (
				<EntryForm
					projects={bookable.data}
					initial={{ slot: '', date: current ? today : monday, start: '', end: '', note: '' }}
					title={t('entry.title')}
					onDone={() => {
						setAdding('sent');
						setClosed(true);
					}}
					onCancel={() => {
						setAdding('idle');
						setClosed(true);
					}}
				/>
			) : (
				<div className={styles.add}>
					{adding === 'sent' && <Notice tone="success">{t('detail.done.added')}</Notice>}
					<div>
						<Button variant="secondary" autoFocus={closed} onPress={() => setAdding('form')}>
							{t('entry.open')}
						</Button>
					</div>
				</div>
			)}
			{hr && (
				<div className={styles.below}>
					<Unbilled unbilled={week.unbilled} />
					<Budgets />
				</div>
			)}
		</>
	);
}
