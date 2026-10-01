import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { noteSchema } from '@zeit/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { FormTextArea } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { hasCode } from '../../lib/api/errors';
import type { DayFinding } from '../week/day-detail';
import styles from '../week/form.module.css';
import { ackFinding } from './api';

const ackSchema = z.object({ note: noteSchema });

type Props = {
	employeeId: string;
	date: string;
	finding: DayFinding;
};

export function AckForm({ employeeId, date, finding }: Props) {
	const { t } = useTranslation(['time', 'common']);
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const { control, handleSubmit } = useForm<
		z.input<typeof ackSchema>,
		unknown,
		z.output<typeof ackSchema>
	>({
		resolver: zodResolver(ackSchema),
		defaultValues: { note: '' }
	});

	const ack = useMutation({
		mutationFn: (note: string) =>
			ackFinding({ employeeId, date, code: finding.code, ruleVersion: finding.ruleVersion, note }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['days', employeeId] })
	});

	if (!open) {
		return (
			<div>
				<Button variant="secondary" onPress={() => setOpen(true)}>
					{t('ack.open')}
				</Button>
			</div>
		);
	}

	const refusal = (err: Error) => {
		if (hasCode(err, 'ALREADY_EXISTS')) return t('ack.done');
		if (hasCode(err, 'FORBIDDEN')) return t('ack.forbidden');
		return t(errorKey(err));
	};

	return (
		<form
			className={styles.inline}
			noValidate
			onSubmit={handleSubmit(({ note }) => ack.mutate(note))}
		>
			<FormTextArea
				control={control}
				name="note"
				label={t('ack.note')}
				description={t('ack.noteHint')}
				rows={2}
			/>
			{ack.error && <Notice tone="error">{refusal(ack.error)}</Notice>}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={ack.isPending}>
					{t('ack.submit')}
				</Button>
				<Button variant="quiet" isDisabled={ack.isPending} onPress={() => setOpen(false)}>
					{t('ack.cancel')}
				</Button>
			</div>
		</form>
	);
}
