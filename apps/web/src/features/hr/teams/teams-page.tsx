import { useQuery } from '@tanstack/react-query';
import type { Team } from '@zeit/shared';
import { Fragment, useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { Table } from '../../../components/ui/table';
import { employeesQuery, teamsQuery } from '../api';
import { HrNav } from '../hr-nav';
import { Loading, LoadError } from '../ui/states';
import styles from '../ui/page.module.css';
import { TeamLeadsForm } from './team-leads-form';
import { TeamNameForm } from './team-name-form';

type Editing = { team: Team; part: 'name' | 'leads' } | null;

export function TeamsPage() {
	const { t, i18n } = useTranslation('hr');
	const [creating, setCreating] = useState(false);
	const [editing, setEditing] = useState<Editing>(null);
	const teams = useQuery(teamsQuery);
	const employees = useQuery(employeesQuery());
	const failed = [teams, employees].find((query) => query.isError);

	let list;
	if (failed) {
		list = <LoadError error={failed.error} onRetry={() => void failed.refetch()} />;
	} else if (!teams.data || !employees.data) {
		list = <Loading />;
	} else if (teams.data.length === 0) {
		list = <EmptyState title={t('teams.empty')}>{t('teams.emptyHint')}</EmptyState>;
	} else {
		const people = employees.data;
		list = (
			<Table label={t('teams.title')}>
				<thead>
					<tr>
						<th scope="col">{t('teams.name')}</th>
						<th scope="col" data-numeric>
							{t('teams.members')}
						</th>
						<th scope="col">{t('teams.leads')}</th>
						<th scope="col">
							<VisuallyHidden>{t('actions')}</VisuallyHidden>
						</th>
					</tr>
				</thead>
				<tbody>
					{teams.data
						.toSorted((a, b) => a.name.localeCompare(b.name, i18n.language))
						.map((team) => (
							<Fragment key={team.id}>
								<tr>
									<td>{team.name}</td>
									<td data-numeric>{team.memberCount}</td>
									<td>
										{team.leads.length > 0 ? (
											team.leads.map((lead) => lead.displayName).join(', ')
										) : (
											<span className={styles.muted}>{t('teams.noLead')}</span>
										)}
									</td>
									<td>
										<div className={styles.rowActions}>
											<Button variant="quiet" onPress={() => setEditing({ team, part: 'name' })}>
												{t('teams.rename')}
											</Button>
											<Button variant="quiet" onPress={() => setEditing({ team, part: 'leads' })}>
												{t('teams.editLeads')}
											</Button>
										</div>
									</td>
								</tr>
								{editing?.team.id === team.id && (
									<tr>
										<td colSpan={4}>
											{editing.part === 'name' ? (
												<TeamNameForm team={team} onDone={() => setEditing(null)} />
											) : (
												<TeamLeadsForm
													team={team}
													employees={people}
													onDone={() => setEditing(null)}
												/>
											)}
										</td>
									</tr>
								)}
							</Fragment>
						))}
				</tbody>
			</Table>
		);
	}

	return (
		<>
			<HrNav />
			<div className={styles.page}>
				<header className={styles.head}>
					<div>
						<h1>{t('teams.title')}</h1>
						<p className={styles.lead}>{t('teams.lead')}</p>
					</div>
					{!creating && (
						<Button variant="primary" onPress={() => setCreating(true)}>
							{t('teams.new')}
						</Button>
					)}
				</header>
				{creating && <TeamNameForm onDone={() => setCreating(false)} />}
				<section className={styles.section} aria-label={t('teams.title')}>
					{list}
				</section>
			</div>
		</>
	);
}
