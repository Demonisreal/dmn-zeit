import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTaskSchema, type Task } from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { FormSelect } from '../../components/ui/select-field';
import { useErrorText } from '../hr/error-text';
import styles from '../hr/ui/page.module.css';
import { createTask, updateTask } from './api';

const choices = ['inherit', 'yes', 'no'] as const;

const schema = z.object({
	name: createTaskSchema.shape.name,
	billable: z.enum(choices).transform((choice) => (choice === 'inherit' ? null : choice === 'yes'))
});

const choiceOf = (billable: boolean | null | undefined): (typeof choices)[number] =>
	billable === undefined || billable === null ? 'inherit' : billable ? 'yes' : 'no';

type Props = {
	projectId: string;
	task?: Task | undefined;
	onDone: () => void;
};

export function TaskForm({ projectId, task, onDone }: Props) {
	const { t } = useTranslation('billing');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(schema),
		defaultValues: { name: task?.name ?? '', billable: choiceOf(task?.billable) }
	});

	const save = useMutation({
		mutationFn: (input: z.output<typeof schema>) =>
			task ? updateTask(task.id, input) : createTask(projectId, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['projects'] });
			onDone();
		}
	});

	return (
		<form
			className={styles.panel}
			noValidate
			aria-label={task ? t('tasks.editTitle', { name: task.name }) : t('tasks.new')}
			onSubmit={handleSubmit((input) => save.mutate(input))}
		>
			<div className={styles.filters}>
				<FormField control={control} name="name" label={t('tasks.name')} autoFocus />
				<FormSelect
					control={control}
					name="billable"
					label={t('projects.billing')}
					options={choices.map((choice) => ({ id: choice, label: t(`tasks.billable.${choice}`) }))}
				/>
				<div className={styles.actions}>
					<Button type="submit" variant="primary" isPending={save.isPending}>
						{task ? t('save') : t('tasks.new')}
					</Button>
					<Button variant="quiet" onPress={onDone}>
						{t('cancel')}
					</Button>
				</div>
			</div>
			{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
		</form>
	);
}
