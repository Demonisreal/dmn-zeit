import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
	createEmployeeSchema,
	type CreateEmployeeInput,
	type Team,
	type WorkModel
} from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { FormField } from '../../../components/ui/field';
import { Notice } from '../../../components/ui/notice';
import { createEmployee } from '../api';
import { useErrorText } from '../error-text';
import { FormDate } from '../ui/date-field';
import { FormSelect } from '../ui/select-field';
import styles from '../ui/page.module.css';
import { ContractFields } from './contract-fields';
import { contractDefaults, contractShape } from './contract-schema';
import { noTeam, teamField, teamOptions } from './employee-options';

const fields = createEmployeeSchema.shape;

const schema = z
	.object({
		personnelNo: fields.personnelNo,
		firstName: fields.firstName,
		lastName: fields.lastName,
		teamId: teamField,
		entryDate: fields.entryDate,
		...contractShape
	})
	.transform(
		({
			personnelNo,
			firstName,
			lastName,
			teamId,
			entryDate,
			...contract
		}): CreateEmployeeInput => ({
			personnelNo,
			firstName,
			lastName,
			teamId,
			entryDate,
			contract
		})
	);

type Props = {
	teams: Team[];
	workModels: WorkModel[];
	onDone: () => void;
};

export function EmployeeForm({ teams, workModels, onDone }: Props) {
	const { t } = useTranslation('hr');
	const errorText = useErrorText();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(schema),
		defaultValues: {
			personnelNo: '',
			firstName: '',
			lastName: '',
			teamId: noTeam,
			entryDate: '',
			...contractDefaults(undefined)
		}
	});

	const save = useMutation({
		mutationFn: createEmployee,
		onSuccess: async (employee) => {
			await queryClient.invalidateQueries({ queryKey: ['employees'] });
			await navigate({ to: '/hr/people/$id', params: { id: employee.id } });
		}
	});

	return (
		<form
			className={styles.panel}
			noValidate
			aria-labelledby="new-employee"
			onSubmit={handleSubmit((input) => save.mutate(input))}
		>
			<div>
				<h2 id="new-employee">{t('people.new')}</h2>
				<p className={styles.lead}>{t('people.newHint')}</p>
			</div>
			<div className={styles.fields}>
				<FormField control={control} name="personnelNo" label={t('people.personnelNo')} />
				<FormField control={control} name="firstName" label={t('people.firstName')} />
				<FormField control={control} name="lastName" label={t('people.lastName')} />
				<FormSelect
					control={control}
					name="teamId"
					label={t('people.team')}
					options={teamOptions(teams, t('people.noTeam'))}
				/>
				<FormDate control={control} name="entryDate" label={t('people.entry')} />
				<ContractFields control={control} workModels={workModels} />
			</div>
			{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={save.isPending}>
					{t('people.create')}
				</Button>
				<Button variant="quiet" onPress={onDone}>
					{t('cancel')}
				</Button>
			</div>
		</form>
	);
}
