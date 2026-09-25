import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateProjectSchema, type Project } from '@zeit/shared';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { FormField } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { FormSelect } from '../../components/ui/select-field';
import { durationText } from '../hr/duration';
import { useErrorText } from '../hr/error-text';
import styles from '../hr/ui/page.module.css';
import { createProject, updateProject } from './api';
import {
	blankToNull,
	budgetField,
	incrementField,
	modeField,
	roundingDefaults,
	roundingOptions
} from './fields';
import css from './form.module.css';

const fields = updateProjectSchema.required().shape;

const schema = z.object({
	name: fields.name,
	code: blankToNull.pipe(fields.code),
	billable: z.boolean(),
	budgetMinutes: budgetField,
	roundingIncrementMin: incrementField,
	roundingMode: modeField
});

type Props = {
	clientId: string;
	project?: Project | undefined;
	onDone: (created?: Project) => void;
};

export function ProjectForm({ clientId, project, onDone }: Props) {
	const { t } = useTranslation('billing');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(schema),
		defaultValues: {
			name: project?.name ?? '',
			code: project?.code ?? '',
			billable: project?.billable ?? true,
			budgetMinutes: project?.budget ? durationText(project.budget.minutes) : '',
			...roundingDefaults(project)
		}
	});
	const rounding = roundingOptions(t, t('inheritClient'));

	const save = useMutation({
		mutationFn: async (input: z.output<typeof schema>) => {
			if (!project) return createProject({ clientId, openToAll: true, ...input });
			await updateProject(project.id, input);
		},
		onSuccess: async (created) => {
			await queryClient.invalidateQueries({ queryKey: ['projects'] });
			onDone(created);
		}
	});

	return (
		<form
			className={styles.panel}
			noValidate
			aria-labelledby="project-form"
			onSubmit={handleSubmit((input) => save.mutate(input))}
		>
			<h2 id="project-form">{project ? t('project.editTitle') : t('projects.new')}</h2>
			<div className={styles.fields}>
				<div className={styles.wide}>
					<div className={css.name}>
						<FormField control={control} name="name" label={t('projects.name')} autoFocus />
					</div>
				</div>
				<FormField control={control} name="code" label={t('projects.code')} />
				<FormField
					control={control}
					name="budgetMinutes"
					label={t('projects.budget')}
					description={t('projects.budgetHint')}
					inputMode="numeric"
				/>
				<FormSelect
					control={control}
					name="roundingIncrementMin"
					label={t('rounding.increment')}
					options={rounding.increments}
				/>
				<FormSelect
					control={control}
					name="roundingMode"
					label={t('rounding.modeLabel')}
					options={rounding.modes}
				/>
				<div className={styles.wide}>
					<Controller
						control={control}
						name="billable"
						render={({ field }) => (
							<Checkbox isSelected={field.value} onChange={field.onChange}>
								{t('projects.billableLabel')}
							</Checkbox>
						)}
					/>
				</div>
			</div>
			{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={save.isPending}>
					{project ? t('save') : t('projects.new')}
				</Button>
				<Button variant="quiet" onPress={() => onDone()}>
					{t('cancel')}
				</Button>
			</div>
		</form>
	);
}
