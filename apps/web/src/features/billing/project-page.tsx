import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { Project, Role } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Page, PageHead } from '../../components/ui/page-shell';
import { Loading, LoadError } from '../../components/ui/states';
import { Tag } from '../../components/ui/tag';
import styles from '../hr/ui/page.module.css';
import { useExplain } from '../projects/explain';
import { clientQuery, projectQuery, tasksQuery } from './api';
import { BillingNav } from './billing-nav';
import { BudgetTag } from './budget-tag';
import { ProjectForm } from './project-form';
import { ProjectMembers } from './project-members';
import css from './project-page.module.css';
import { ProjectTasks } from './project-tasks';
import { RatesTable } from './rates-table';
import { useRoundingText } from './use-rounding-text';

type Props = {
	id: string;
	solo: boolean;
	role: Role;
};

export function ProjectPage({ id, solo, role }: Props) {
	const { t } = useTranslation('billing');
	const [editing, setEditing] = useState(false);
	const [closed, setClosed] = useState(false);
	const project = useQuery(projectQuery(id));
	const clientId = project.data?.clientId;
	const client = useQuery({ ...clientQuery(clientId ?? ''), enabled: clientId !== undefined });
	const tasks = useQuery(tasksQuery(id));

	const failed = [project, client, tasks].find((query) => query.isError);

	let body;
	if (failed) {
		body = <LoadError error={failed.error} onRetry={() => void failed.refetch()} />;
	} else if (!project.data || !client.data || !tasks.data) {
		body = <Loading rows={6} />;
	} else {
		const current = project.data;
		body = (
			<>
				<p className={styles.small}>
					<Link to="/billing/clients/$id" params={{ id: client.data.id }}>
						{t('project.back', { client: client.data.name })}
					</Link>
				</p>
				<PageHead>
					<div>
						<h1 className={css.title}>
							{current.name} {current.archivedAt && <Tag>{t('archived')}</Tag>}
						</h1>
						<p className={styles.lead}>
							{current.code
								? t('project.leadWithCode', { client: client.data.name, code: current.code })
								: client.data.name}
						</p>
					</div>
					{!editing && (
						<Button variant="secondary" autoFocus={closed} onPress={() => setEditing(true)}>
							{t('project.edit')}
						</Button>
					)}
				</PageHead>

				{editing ? (
					<ProjectForm
						clientId={current.clientId}
						project={current}
						onDone={() => {
							setEditing(false);
							setClosed(true);
						}}
					/>
				) : (
					<ProjectFacts project={current} />
				)}

				{!solo && <ProjectMembers project={current} />}
				<ProjectTasks project={current} tasks={tasks.data} />
				<RatesTable
					scope={{
						kind: 'project',
						clientId: current.clientId,
						projectId: current.id,
						tasks: tasks.data
					}}
					solo={solo}
				/>
			</>
		);
	}

	return (
		<>
			<BillingNav role={role} />
			<Page>{body}</Page>
		</>
	);
}

function ProjectFacts({ project }: { project: Project }) {
	const { t } = useTranslation('billing');
	const explain = useExplain();
	const roundingText = useRoundingText(t('inheritClient'));

	return (
		<dl className={styles.facts}>
			<dt>{t('projects.billing')}</dt>
			<dd>{project.billable ? t('projects.billable') : t('projects.notBillable')}</dd>
			<dt>{t('projects.budget')}</dt>
			<dd>
				{project.budget ? (
					<span className={css.budget}>
						{explain(project.budget.explanation)}
						<BudgetTag budget={project.budget} />
					</span>
				) : (
					t('projects.noBudget')
				)}
			</dd>
			<dt>{t('rounding.title')}</dt>
			<dd>{roundingText(project)}</dd>
		</dl>
	);
}
