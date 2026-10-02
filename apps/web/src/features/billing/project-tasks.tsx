import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, Task } from '@zeit/shared';
import { Fragment, useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { EmptyState } from '../../components/ui/empty-state';
import { Notice } from '../../components/ui/notice';
import { Table } from '../../components/ui/table';
import { Tag } from '../../components/ui/tag';
import { useErrorText } from '../hr/error-text';
import styles from '../hr/ui/page.module.css';
import { archiveTask } from './api';
import { TaskForm } from './task-form';

type Props = {
	project: Project;
	tasks: Task[];
};

export function ProjectTasks({ project, tasks }: Props) {
	const { t, i18n } = useTranslation('billing');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const [creating, setCreating] = useState(false);
	const [closed, setClosed] = useState(false);
	const [editing, setEditing] = useState<Task | null>(null);
	const [archiving, setArchiving] = useState<Task | null>(null);

	const archive = useMutation({
		mutationFn: (task: Task) => archiveTask(task.id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['projects'] });
			setArchiving(null);
		}
	});

	const sorted = tasks.toSorted(
		(a, b) =>
			Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
			a.name.localeCompare(b.name, i18n.language)
	);
	const billing = (task: Task) =>
		task.billable === null
			? t(project.billable ? 'tasks.inheritYes' : 'tasks.inheritNo')
			: t(task.billable ? 'projects.billable' : 'projects.notBillable');

	return (
		<section className={styles.section} aria-labelledby="project-tasks">
			<div className={styles.sectionHead}>
				<div>
					<h2 id="project-tasks">{t('tasks.title')}</h2>
					<p className={styles.lead}>{t('tasks.lead')}</p>
				</div>
				{!creating && (
					<Button variant="secondary" autoFocus={closed} onPress={() => setCreating(true)}>
						{t('tasks.new')}
					</Button>
				)}
			</div>
			{creating && (
				<TaskForm
					projectId={project.id}
					onDone={() => {
						setCreating(false);
						setClosed(true);
					}}
				/>
			)}
			{sorted.length === 0 ? (
				<EmptyState title={t('tasks.empty')} />
			) : (
				<div className={styles.scroll} role="group" aria-labelledby="project-tasks" tabIndex={0}>
					<Table label={t('tasks.title')}>
						<thead>
							<tr>
								<th scope="col">{t('tasks.name')}</th>
								<th scope="col" data-priority="mid">
									{t('projects.billing')}
								</th>
								<th scope="col">
									<VisuallyHidden>{t('actions')}</VisuallyHidden>
								</th>
							</tr>
						</thead>
						<tbody>
							{sorted.map((task) => (
								<Fragment key={task.id}>
									<tr>
										<td>
											{task.name} {task.archivedAt && <Tag>{t('archived')}</Tag>}
										</td>
										<td data-priority="mid">{billing(task)}</td>
										<td>
											{!task.archivedAt && (
												<div className={styles.rowActions}>
													<Button
														variant="quiet"
														aria-label={t('tasks.editTitle', { name: task.name })}
														onPress={() => setEditing(task)}
													>
														{t('edit')}
													</Button>
													<Button
														variant="quiet"
														aria-label={t('tasks.archiveTitle', { name: task.name })}
														onPress={() => setArchiving(task)}
													>
														{t('tasks.archive')}
													</Button>
												</div>
											)}
										</td>
									</tr>
									{editing?.id === task.id && (
										<tr>
											<td colSpan={3}>
												<TaskForm
													projectId={project.id}
													task={task}
													onDone={() => setEditing(null)}
												/>
											</td>
										</tr>
									)}
								</Fragment>
							))}
						</tbody>
					</Table>
				</div>
			)}
			<ConfirmDialog
				isOpen={archiving !== null}
				onClose={() => {
					setArchiving(null);
					archive.reset();
				}}
				title={t('tasks.archiveTitle', { name: archiving?.name ?? '' })}
				confirmLabel={t('tasks.archive')}
				onConfirm={() => archiving && archive.mutate(archiving)}
				isPending={archive.isPending}
				error={archive.error && <Notice tone="error">{errorText(archive.error)}</Notice>}
			>
				<p>{t('tasks.archiveText')}</p>
			</ConfirmDialog>
		</section>
	);
}
