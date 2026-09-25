import { parseDate } from '@internationalized/date';
import { useQuery } from '@tanstack/react-query';
import { hasRole, type Session } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/ui/empty-state';
import { SelectField } from '../../components/ui/select-field';
import { LoadError, Loading } from '../../components/ui/states';
import { formatMonth } from '../../i18n/format';
import page from '../absences/ui/page.module.css';
import { PeriodStepper } from '../absences/ui/period-stepper';
import { teamsQuery } from '../hr/api';
import { teamCalendarQuery } from './api';
import styles from './team-calendar.module.css';
import { TeamGrid } from './team-grid';

export type TeamCalendarSearch = {
	month?: string | undefined;
	team?: string | undefined;
};

type Props = {
	session: Session;
	month: string;
	team: string | undefined;
	onSearch: (next: TeamCalendarSearch) => void;
};

const shift = (month: string, by: number) =>
	parseDate(`${month}-01`).add({ months: by }).toString().slice(0, 7);

export function TeamCalendarPage({ session, month, team, onSearch }: Props) {
	const { t, i18n } = useTranslation('team');
	const hr = hasRole(session.user.role, 'hr');
	const teams = useQuery({ ...teamsQuery, enabled: hr });
	// hr picks from every team, a team lead from the teams they lead, employees see their own
	const options = hr ? (teams.data ?? []) : session.leadsTeams;
	const selected = team ?? options[0]?.id;
	const calendar = useQuery({
		...teamCalendarQuery(month, selected),
		enabled: !hr || !teams.isPending
	});
	// mirrors team_absence_days, a lead of another team only sees "absent" here
	const full = hr || session.leadsTeams.some((led) => led.id === selected);

	const body = () => {
		if (calendar.isPending) return <Loading rows={5} />;
		if (calendar.isError) {
			return <LoadError error={calendar.error} onRetry={() => void calendar.refetch()} />;
		}
		if (calendar.data.people.length === 0) return <EmptyState title={t('empty')} />;
		return (
			<>
				<TeamGrid
					calendar={calendar.data}
					labelledBy="team-calendar-title team-calendar-month"
					linkPeople={full}
				/>
				<p className={styles.legend}>
					{full ? t('legend.types') : t('legend.absent')} {t('legend.marks')}
					{full && ` ${t('legend.names')}`}
				</p>
			</>
		);
	};

	return (
		<div className={page.page}>
			<header className={page.head}>
				<h1 id="team-calendar-title">{t('title')}</h1>
				<div className={styles.controls}>
					{options.length > 1 && (
						<SelectField
							label={t('team')}
							options={options.map((option) => ({ id: option.id, label: option.name }))}
							value={selected ?? null}
							onChange={(key) => key !== null && onSearch({ team: String(key) })}
						/>
					)}
					<PeriodStepper
						label={t('month')}
						previousLabel={t('prevMonth')}
						nextLabel={t('nextMonth')}
						onPrevious={() => onSearch({ month: shift(month, -1) })}
						onNext={() => onSearch({ month: shift(month, 1) })}
					>
						<span id="team-calendar-month" className={styles.month}>
							{formatMonth(month, i18n.language)}
						</span>
					</PeriodStepper>
				</div>
			</header>
			{options.length === 1 && <p className={styles.team}>{options[0]?.name}</p>}
			{body()}
		</div>
	);
}
