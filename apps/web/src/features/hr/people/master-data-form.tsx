import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateEmployeeSchema, type Employee, type Team } from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { FormField } from '../../../components/ui/field';
import { Notice } from '../../../components/ui/notice';
import { FormSelect } from '../../../components/ui/select-field';
import { updateEmployee } from '../api';
import { useErrorText } from '../error-text';
import styles from '../ui/page.module.css';
import { noTeam, teamField, teamOptions } from './employee-options';

const fields = updateEmployeeSchema.required().shape;

const schema = z.object({
	personnelNo: fields.personnelNo,
	firstName: fields.firstName,
	lastName: fields.lastName,
	teamId: teamField.pipe(fields.teamId)
});

type Props = {
	employee: Employee;
	teams: Team[];
	onDone: () => void;
};

export function MasterDataForm({ employee, teams, onDone }: Props) {
	const { t } = useTranslation('hr');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(schema),
		defaultValues: {
			personnelNo: employee.personnelNo,
			firstName: employee.firstName,
			lastName: employee.lastName,
			teamId: employee.teamId ?? noTeam
		}
	});

	const save = useMutation({
		mutationFn: (input: z.output<typeof schema>) => updateEmployee(employee.id, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['employees'] });
			onDone();
		}
	});

	return (
		<form
			className={styles.panel}
			noValidate
			aria-labelledby="master-data"
			onSubmit={handleSubmit((input) => save.mutate(input))}
		>
			<h2 id="master-data">{t('people.editTitle')}</h2>
			<div className={styles.fields}>
				<FormField control={control} name="personnelNo" label={t('people.personnelNo')} autoFocus />
				<FormField control={control} name="firstName" label={t('people.firstName')} />
				<FormField control={control} name="lastName" label={t('people.lastName')} />
				<FormSelect
					control={control}
					name="teamId"
					label={t('people.team')}
					options={teamOptions(teams, t('people.noTeam'))}
				/>
			</div>
			{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={save.isPending}>
					{t('save')}
				</Button>
				<Button variant="quiet" onPress={onDone}>
					{t('cancel')}
				</Button>
			</div>
		</form>
	);
}
