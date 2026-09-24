import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Contract, CreateContractInput, Employee, WorkModel } from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { Notice } from '../../../components/ui/notice';
import { formatDate } from '../../../i18n/format';
import { createContract } from '../api';
import { useErrorText } from '../error-text';
import { FormDate } from '../ui/date-field';
import styles from '../ui/page.module.css';
import { ContractFields } from './contract-fields';
import { contractDefaults, newContractSchema } from './contract-schema';

type Props = {
	employee: Employee;
	current: Contract | undefined;
	workModels: WorkModel[];
	onDone: () => void;
};

export function ContractForm({ employee, current, workModels, onDone }: Props) {
	const { t, i18n } = useTranslation('hr');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const schema = newContractSchema.refine((contract) => contract.validFrom >= employee.entryDate, {
		path: ['validFrom'],
		message: t('contracts.beforeEntry', { date: formatDate(employee.entryDate, i18n.language) })
	});
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(schema),
		defaultValues: contractDefaults(current)
	});

	const save = useMutation({
		mutationFn: (input: CreateContractInput) => createContract(employee.id, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['contracts', employee.id] });
			onDone();
		}
	});

	return (
		<form
			className={styles.panel}
			noValidate
			aria-labelledby="new-contract"
			onSubmit={handleSubmit((input) => save.mutate(input))}
		>
			<div>
				<h2 id="new-contract">{t('contracts.new')}</h2>
				<p className={styles.lead}>{t('contracts.newHint')}</p>
			</div>
			<div className={styles.fields}>
				<FormDate control={control} name="validFrom" label={t('contracts.validFrom')} />
				<ContractFields control={control} workModels={workModels} />
			</div>
			{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={save.isPending}>
					{t('contracts.save')}
				</Button>
				<Button variant="quiet" onPress={onDone}>
					{t('cancel')}
				</Button>
			</div>
		</form>
	);
}
