import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { Client } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { EmptyState } from '../../components/ui/empty-state';
import { Loading, LoadError } from '../../components/ui/states';
import { Table } from '../../components/ui/table';
import { Tag } from '../../components/ui/tag';
import { formatMinutes } from '../../i18n/format';
import styles from '../hr/ui/page.module.css';
import { projectsQuery } from './api';
import { BudgetTag } from './budget-tag';
import css from './client-page.module.css';
import { ProjectForm } from './project-form';

type Props = {
	client: Client;
};

export function ClientProjects({ client }: Props) {
	const { t, i18n } = useTranslation(['billing', 'projects']);
	const navigate = useNavigate();
	const [includeArchived, setIncludeArchived] = useState(false);
	const [creating, setCreating] = useState(false);
	const [closed, setClosed] = useState(false);
	const projects = useQuery(projectsQuery(client.id));

	const active = (projects.data ?? []).filter((project) => includeArchived || !project.archivedAt);
	const shown = active.toSorted((a, b) => a.name.localeCompare(b.name, i18n.language));

	let list;
	if (projects.isError) {
		list = <LoadError error={projects.error} onRetry={() => void projects.refetch()} />;
	} else if (!projects.data) {
		list = <Loading rows={3} />;
	} else if (projects.data.length === 0) {
		list = <EmptyState title={t('projects.empty')}>{t('projects.emptyHint')}</EmptyState>;
	} else if (shown.length === 0) {
		list = <EmptyState title={t('projects.allArchived')} />;
	} else {
		list = (
			<div className={styles.scroll} role="group" aria-labelledby="client-projects" tabIndex={0}>
				<Table label={t('projects.title')}>
					<thead>
						<tr>
							<th scope="col">{t('projects.name')}</th>
							<th scope="col" data-priority="mid">
								{t('projects.code')}
							</th>
							<th scope="col" data-priority="wide">
								{t('projects.billing')}
							</th>
							<th scope="col" data-numeric>
								{t('projects.budget')}
							</th>
						</tr>
					</thead>
					<tbody>
						{shown.map((project) => (
							<tr key={project.id}>
								<td className={css.name}>
									<Link to="/billing/projects/$id" params={{ id: project.id }}>
										{project.name}
									</Link>{' '}
									{project.archivedAt && <Tag>{t('archived')}</Tag>}
								</td>
								<td className={styles.mono} data-priority="mid">
									{project.code}
								</td>
								<td data-priority="wide">
									{project.billable ? t('projects.billable') : t('projects.notBillable')}
								</td>
								<td data-numeric>
									{project.budget ? (
										<span className={css.budget}>
											{t('projects:budgets.used', {
												used: formatMinutes(project.budget.usedMinutes),
												budget: formatMinutes(project.budget.minutes)
											})}
											<BudgetTag budget={project.budget} />
										</span>
									) : (
										<span className={styles.muted}>{t('projects.noBudget')}</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</Table>
			</div>
		);
	}

	return (
		<section className={styles.section} aria-labelledby="client-projects">
			<div className={styles.sectionHead}>
				<h2 id="client-projects">{t('projects.title')}</h2>
				{!creating && !client.archivedAt && (
					<Button variant="secondary" autoFocus={closed} onPress={() => setCreating(true)}>
						{t('projects.new')}
					</Button>
				)}
			</div>
			{creating && (
				<ProjectForm
					clientId={client.id}
					onDone={(created) => {
						setCreating(false);
						setClosed(true);
						if (created) void navigate({ to: '/billing/projects/$id', params: { id: created.id } });
					}}
				/>
			)}
			{projects.data?.some((project) => project.archivedAt) && (
				<div className={styles.filters}>
					<Checkbox isSelected={includeArchived} onChange={setIncludeArchived}>
						{t('projects.includeArchived')}
					</Checkbox>
				</div>
			)}
			{list}
		</section>
	);
}
