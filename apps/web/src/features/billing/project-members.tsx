import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project } from '@zeit/shared';
import { useState } from 'react';
import { CheckboxGroup, Label } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Notice, SavedNotice } from '../../components/ui/notice';
import { Skeleton } from '../../components/ui/skeleton';
import { LoadError } from '../../components/ui/states';
import { todayIso } from '../../lib/dates';
import { employeesQuery } from '../hr/api';
import { useErrorText } from '../hr/error-text';
import { fullName } from '../hr/people/employee-options';
import styles from '../hr/ui/page.module.css';
import { membersQuery, setMembers, updateProject, type ProjectMember } from './api';
import css from './project-page.module.css';

type Props = {
	project: Project;
};

export function ProjectMembers({ project }: Props) {
	const { t } = useTranslation('billing');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const [editing, setEditing] = useState(false);
	const members = useQuery({ ...membersQuery(project.id), enabled: !project.openToAll });

	const toggle = useMutation({
		mutationFn: (openToAll: boolean) => updateProject(project.id, { openToAll }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] })
	});
	const openToAll = toggle.isPending ? toggle.variables : project.openToAll;

	let list;
	if (members.isError) {
		list = <LoadError error={members.error} onRetry={() => void members.refetch()} />;
	} else if (!members.data) {
		list = <Skeleton width="16rem" />;
	} else if (editing) {
		list = (
			<MembersForm project={project} members={members.data} onDone={() => setEditing(false)} />
		);
	} else {
		list = (
			<>
				<p>
					{members.data.length > 0 ? (
						members.data.map((member) => member.name).join(', ')
					) : (
						<span className={styles.muted}>{t('members.none')}</span>
					)}
				</p>
				<div>
					<Button
						variant="secondary"
						onPress={() => {
							toggle.reset();
							setEditing(true);
						}}
					>
						{t('members.edit')}
					</Button>
				</div>
			</>
		);
	}

	return (
		<section className={styles.section} aria-labelledby="project-members">
			<h2 id="project-members">{t('members.title')}</h2>
			<div>
				<Checkbox
					isSelected={openToAll}
					isDisabled={toggle.isPending}
					onChange={(open) => toggle.mutate(open)}
				>
					{t('members.openToAll')}
				</Checkbox>
				<p className={`${styles.small} ${styles.muted}`}>
					{openToAll ? t('members.openHint') : t('members.closedHint')}
				</p>
			</div>
			{toggle.error && <Notice tone="error">{errorText(toggle.error)}</Notice>}
			<SavedNotice shown={toggle.isSuccess}>{t('members.saved')}</SavedNotice>
			{!project.openToAll && list}
		</section>
	);
}

type FormProps = {
	project: Project;
	members: ProjectMember[];
	onDone: () => void;
};

function MembersForm({ project, members, onDone }: FormProps) {
	const { t, i18n } = useTranslation('billing');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const [chosen, setChosen] = useState(members.map((member) => member.employeeId));
	const employees = useQuery(employeesQuery());
	const today = todayIso();

	const candidates = new Map(members.map((member) => [member.employeeId, member.name]));
	for (const employee of employees.data ?? []) {
		if (!employee.exitDate || employee.exitDate >= today) {
			candidates.set(employee.id, fullName(employee));
		}
	}
	const options = [...candidates].toSorted(([, a], [, b]) => a.localeCompare(b, i18n.language));

	const save = useMutation({
		mutationFn: () => setMembers(project.id, chosen),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['projects'] });
			onDone();
		}
	});

	if (employees.isError) {
		return <LoadError error={employees.error} onRetry={() => void employees.refetch()} />;
	}

	return (
		<div className={styles.panel}>
			<CheckboxGroup value={chosen} onChange={setChosen}>
				<Label className={styles.small}>{t('members.choose', { name: project.name })}</Label>
				{employees.data ? (
					<div className={css.options}>
						{options.map(([employeeId, name]) => (
							<Checkbox key={employeeId} value={employeeId}>
								{name}
							</Checkbox>
						))}
					</div>
				) : (
					<Skeleton width="16rem" />
				)}
			</CheckboxGroup>
			{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
			<div className={styles.actions}>
				<Button variant="primary" isPending={save.isPending} onPress={() => save.mutate()}>
					{t('members.save')}
				</Button>
				<Button variant="quiet" onPress={onDone}>
					{t('cancel')}
				</Button>
			</div>
		</div>
	);
}
