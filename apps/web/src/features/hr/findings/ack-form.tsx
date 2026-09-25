import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ackFindingSchema, type Finding } from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { FormTextArea } from '../../../components/ui/field';
import { Notice } from '../../../components/ui/notice';
import { ackFinding } from '../api';
import { useErrorText } from '../error-text';
import styles from '../ui/page.module.css';

const schema = z.object({ note: ackFindingSchema.shape.note });

type Props = {
	finding: Finding;
	onDone: () => void;
};

export function AckForm({ finding, onDone }: Props) {
	const { t } = useTranslation('hr');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(schema),
		defaultValues: { note: '' }
	});

	const ack = useMutation({
		mutationFn: (note: string) =>
			ackFinding({
				employeeId: finding.employee.id,
				date: finding.date,
				code: finding.code,
				ruleVersion: finding.ruleVersion,
				note
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['findings'] });
			onDone();
		}
	});

	return (
		<form
			className={styles.panel}
			noValidate
			aria-label={t('findings.ackTitle', { name: finding.employee.name })}
			onSubmit={handleSubmit(({ note }) => ack.mutate(note))}
		>
			<FormTextArea
				control={control}
				name="note"
				label={t('findings.note')}
				description={t('findings.noteHint')}
				rows={2}
				autoFocus
			/>
			{ack.error && <Notice tone="error">{errorText(ack.error)}</Notice>}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={ack.isPending}>
					{t('findings.ack')}
				</Button>
				<Button variant="quiet" onPress={onDone}>
					{t('cancel')}
				</Button>
			</div>
		</form>
	);
}
