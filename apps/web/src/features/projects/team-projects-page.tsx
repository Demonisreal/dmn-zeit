import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { hasRole, type DayCoverage, type ProjectSummary, type Session } from '@zeit/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Page, PageHead } from '../../components/ui/page-shell';
import { PeriodNav } from '../../components/ui/period-nav';
import { SelectField } from '../../components/ui/select-field';
import { LoadError, Loading } from '../../components/ui/states';
import { Table } from '../../components/ui/table';
import { Tag } from '../../components/ui/tag';
import { formatMinutes } from '../../i18n/format';
import { todayIso } from '../../lib/dates';
import { teamsQuery } from '../hr/api';
import { addDays, isoWeek, mondayOf } from '../week/dates';
import { projectWeekQuery, summaryQuery } from './api';
import { MatrixTable } from './matrix-table';
import styles from './team-projects.module.css';

export type TeamProjectsSearch = {
	week?: string | undefined;
	team?: string | undefined;
	employee?: string | undefined;
};

type Props = {
	session: Session;
	week: string | undefined;
	team: string | undefined;
	employee: string | undefined;
	onSearch: (next: TeamProjectsSearch) => void;
};

type Person = { id: string; name: string; minutes: number; coverage: DayCoverage[] };

function people(summary: ProjectSummary): Person[] {
	const byId = new Map<string, Person>();
	for (const row of summary) {
		const person = byId.get(row.employeeId) ?? {
			id: row.employeeId,
			name: row.employeeName,
			minutes: 0,
			coverage: row.coverage
		};
		person.minutes += row.minutes;
		byId.set(row.employeeId, person);
	}
	return [...byId.values()];
}

const total = (coverage: DayCoverage[], pick: (day: DayCoverage) => number) =>
	coverage.reduce((sum, day) => sum + pick(day), 0);

export function TeamProjectsPage({ session, week, team, employee, onSearch }: Props) {
	const { t } = useTranslation(['projects', 'week', 'team']);
	const hr = hasRole(session.user.role, 'hr');
	const teams = useQuery({ ...teamsQuery, enabled: hr });
	const options = hr ? (teams.data ?? []) : session.leadsTeams;
	const selected = team ?? options[0]?.id;
	const [jump, setJump] = useState<string | null>(null);
	const monday = mondayOf(week ?? todayIso());
	const number = isoWeek(monday);
	const summary = useQuery({
		...summaryQuery(selected, monday, addDays(monday, 6)),
		enabled: !hr || !teams.isPending,
		placeholderData: keepPreviousData
	});
	const list = summary.data ? people(summary.data) : [];
	const person = list.find((candidate) => candidate.id === employee);

	const overview = () => {
		if (!summary.data) {
			return summary.isError ? (
				<LoadError error={summary.error} onRetry={() => void summary.refetch()} />
			) : (
				<Loading rows={4} />
			);
		}
		if (list.length === 0) return <EmptyState title={t('team.empty')} />;
		return (
			<div
				className={styles.scroll}
				role="region"
				aria-label={t('team.table', { week: number })}
				tabIndex={0}
			>
				<Table label={t('team.table', { week: number })}>
					<thead>
						<tr>
							<th scope="col">{t('team:person')}</th>
							<th scope="col" data-numeric>
								{t('team.projectTime')}
							</th>
							<th scope="col" data-numeric data-priority="mid">
								{t('coverage.worked')}
							</th>
							<th scope="col" data-numeric data-priority="wide">
								{t('coverage.unassigned')}
							</th>
							<th scope="col" data-numeric data-priority="wide">
								{t('coverage.outside')}
							</th>
							<th scope="col">{t('coverage.hints')}</th>
						</tr>
					</thead>
					<tbody>
						{list.map((row) => {
							const hints = [...new Set(row.coverage.flatMap((day) => day.hints))];
							return (
								<tr key={row.id} data-current={row.id === employee || undefined}>
									<th scope="row" className={styles.name}>
										<button
											type="button"
											className={styles.pick}
											aria-pressed={row.id === employee}
											onClick={() => {
												setJump(row.id === employee ? null : row.id);
												onSearch({ employee: row.id === employee ? undefined : row.id });
											}}
										>
											{row.name}
										</button>
									</th>
									<td data-numeric>{formatMinutes(row.minutes)}</td>
									<td data-numeric data-priority="mid">
										{formatMinutes(total(row.coverage, (day) => day.workedMinutes))}
									</td>
									<td data-numeric data-priority="wide">
										{formatMinutes(total(row.coverage, (day) => day.unassignedMinutes))}
									</td>
									<td data-numeric data-priority="wide">
										{formatMinutes(total(row.coverage, (day) => day.outsideMinutes))}
									</td>
									<td>
										<span className={styles.tags}>
											{hints.map((code) => (
												<span key={code} title={t(`coverage.hint.${code}`)}>
													<Tag>{t(`coverage.tag.${code}`)}</Tag>
												</span>
											))}
										</span>
									</td>
								</tr>
							);
						})}
					</tbody>
				</Table>
			</div>
		);
	};

	return (
		<Page>
			<PageHead>
				<h1>{t('team.title')}</h1>
				<div className={styles.controls}>
					{options.length > 1 && (
						<SelectField
							label={t('team:team')}
							options={options.map((option) => ({ id: option.id, label: option.name }))}
							value={selected ?? null}
							onChange={(key) =>
								key !== null && onSearch({ team: String(key), employee: undefined })
							}
						/>
					)}
					<PeriodNav
						label={t('team.week')}
						previous={t('week:previous')}
						next={t('week:next')}
						onStep={(by) => onSearch({ week: addDays(monday, by * 7) })}
						action={
							monday !== mondayOf(todayIso()) && (
								<Button variant="secondary" onPress={() => onSearch({ week: undefined })}>
									{t('week:current')}
								</Button>
							)
						}
					>
						{t('week:label', { week: number })}
					</PeriodNav>
				</div>
			</PageHead>
			{overview()}
			<p className={styles.legend}>{t('team.legend')}</p>
			{person && (
				<PersonWeek person={person} monday={monday} number={number} jump={jump === person.id} />
			)}
		</Page>
	);
}

type PersonProps = {
	person: Person;
	monday: string;
	number: number;
	jump: boolean;
};

function PersonWeek({ person, monday, number, jump }: PersonProps) {
	const { t } = useTranslation('projects');
	const heading = useRef<HTMLHeadingElement>(null);
	const matrix = useQuery({
		...projectWeekQuery(person.id, monday),
		placeholderData: keepPreviousData
	});

	useEffect(() => {
		if (!jump) return;
		heading.current?.focus({ preventScroll: true });
		heading.current?.scrollIntoView({ block: 'start' });
	}, [jump, person.id]);

	return (
		<section className={styles.detail} aria-labelledby="team-projects-person">
			<h2 id="team-projects-person" ref={heading} tabIndex={-1} className={styles.person}>
				{person.name}
			</h2>
			{matrix.data ? (
				<MatrixTable
					label={t('team.matrix', { name: person.name, week: number })}
					week={matrix.data}
					employeeId={person.id}
					own={false}
					amounts={false}
					coverage={matrix.data.coverage}
					empty={t('empty')}
					isStale={matrix.isPlaceholderData}
				/>
			) : matrix.isError ? (
				<LoadError error={matrix.error} onRetry={() => void matrix.refetch()} />
			) : (
				<Loading rows={4} />
			)}
		</section>
	);
}
