import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isoDateSchema, type CreateRateInput, type Employee } from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { FormSelect } from '../../components/ui/select-field';
import { todayIso } from '../../lib/dates';
import { useErrorText } from '../hr/error-text';
import { employeeOptions } from '../hr/people/employee-options';
import { FormDate } from '../hr/ui/date-field';
import styles from '../hr/ui/page.module.css';
import { createRate } from './api';
import { centsField } from './fields';
import css from './form.module.css';
import type { RatesScope } from './rates-scope';

const everyone = 'all';
const wholeProject = 'project';

const schema = z.object({
	level: z.string(),
	employee: z.string(),
	validFrom: isoDateSchema,
	rateCents: centsField
});

type Props = {
	scope: RatesScope;
	employees: Employee[] | null;
	onDone: () => void;
};

export function RateForm({ scope, employees, onDone }: Props) {
	const { t, i18n } = useTranslation('billing');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(schema),
		defaultValues: { level: wholeProject, employee: everyone, validFrom: todayIso(), rateCents: '' }
	});
	const tasks = scope.kind === 'project' ? scope.tasks.filter((task) => !task.archivedAt) : [];

	const save = useMutation({
		mutationFn: ({ level, employee, validFrom, rateCents }: z.output<typeof schema>) => {
			const input: CreateRateInput = {
				clientId: scope.kind === 'default' ? null : scope.clientId,
				projectId: scope.kind === 'project' ? scope.projectId : null,
				taskId: scope.kind === 'project' && level !== wholeProject ? level : null,
				employeeId: employee === everyone ? null : employee,
				validFrom,
				rateCents
			};
			return createRate(input);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['rates'] });
			onDone();
		}
	});

	return (
		<form
			className={styles.panel}
			noValidate
			aria-labelledby={`rate-form-${scope.kind}`}
			onSubmit={handleSubmit((input) => save.mutate(input))}
		>
			<div>
				<h2 id={`rate-form-${scope.kind}`}>{t('rates.new')}</h2>
				<p className={styles.lead}>{t('rates.formHint')}</p>
			</div>
			<div className={styles.fields}>
				{tasks.length > 0 && (
					<FormSelect
						control={control}
						name="level"
						label={t('rates.level')}
						options={[
							{ id: wholeProject, label: t('rates.levels.project') },
							...tasks.map((task) => ({
								id: task.id,
								label: t('rates.levels.task', { name: task.name })
							}))
						]}
					/>
				)}
				{employees && scope.kind !== 'default' && (
					<FormSelect
						control={control}
						name="employee"
						label={t('rates.person')}
						options={[
							{ id: everyone, label: t('rates.everyone') },
							...employeeOptions(employees, i18n.language)
						]}
					/>
				)}
				<FormDate control={control} name="validFrom" label={t('rates.validFrom')} />
				<div className={css.amount}>
					<FormField
						control={control}
						name="rateCents"
						label={t('rates.amount')}
						description={t('rates.amountHint')}
						inputMode="decimal"
						autoFocus
					/>
				</div>
			</div>
			{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={save.isPending}>
					{t('rates.create')}
				</Button>
				<Button variant="quiet" onPress={onDone}>
					{t('cancel')}
				</Button>
			</div>
		</form>
	);
}
