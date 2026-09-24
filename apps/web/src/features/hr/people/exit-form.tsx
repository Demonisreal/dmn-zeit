import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Employee } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { formatDate } from '../../../i18n/format';
import { exitEmployee } from '../api';
import { useErrorText } from '../error-text';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { DateInputField } from '../ui/date-field';
import styles from '../ui/page.module.css';
import { fullName } from './employee-options';

type Props = {
	employee: Employee;
};

export function ExitForm({ employee }: Props) {
	const { t, i18n } = useTranslation('hr');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const [exitDate, setExitDate] = useState('');
	const [problem, setProblem] = useState<string>();
	const [confirming, setConfirming] = useState(false);
	const date = (iso: string) => formatDate(iso, i18n.language);

	const save = useMutation({
		mutationFn: () => exitEmployee(employee.id, exitDate),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['employees'] });
			setConfirming(false);
		}
	});

	const check = () => {
		if (!exitDate) return setProblem(t('required'));
		if (exitDate < employee.entryDate) {
			return setProblem(t('people.exitBeforeEntry', { date: date(employee.entryDate) }));
		}
		setProblem(undefined);
		setConfirming(true);
	};

	return (
		<>
			<div className={styles.filters}>
				<DateInputField
					label={t('people.exitDate')}
					description={t('people.exitHint')}
					value={exitDate}
					onChange={setExitDate}
					error={problem}
				/>
				<Button variant="secondary" onPress={check}>
					{t('people.exitSubmit')}
				</Button>
			</div>
			<ConfirmDialog
				isOpen={confirming}
				onClose={() => {
					setConfirming(false);
					save.reset();
				}}
				title={t('people.exitConfirmTitle', { name: fullName(employee) })}
				confirmLabel={t('people.exitSubmit')}
				onConfirm={() => save.mutate()}
				isPending={save.isPending}
				error={save.error ? errorText(save.error) : undefined}
			>
				<p>{t('people.exitConfirmText', { date: exitDate ? date(exitDate) : '' })}</p>
			</ConfirmDialog>
		</>
	);
}
