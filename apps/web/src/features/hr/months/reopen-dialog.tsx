import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reopenMonthSchema } from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { hasCode } from '../../../lib/api/errors';
import { reopenMonth } from '../api';
import { formatMonth } from '../dates';
import { useErrorText } from '../error-text';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { FormTextArea } from '../ui/text-area-field';
import { useReauth } from '../../security/reauth-dialog';

type Props = {
	month: string;
	isOpen: boolean;
	onClose: () => void;
};

export function ReopenDialog({ month, isOpen, onClose }: Props) {
	const { t, i18n } = useTranslation('hr');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const reauth = useReauth();
	const { control, handleSubmit, reset } = useForm({
		resolver: zodResolver(reopenMonthSchema),
		defaultValues: { reason: '' }
	});

	const reopen = useMutation({
		mutationFn: (reason: string) => reopenMonth(month, reason),
		onSuccess: async () => {
			reset();
			onClose();
			await queryClient.invalidateQueries({ queryKey: ['months'] });
			await queryClient.invalidateQueries({ queryKey: ['employees'] });
		}
	});

	const submit = handleSubmit(({ reason }) =>
		reopen.mutate(reason, { onError: reauth.onError(() => reopen.mutate(reason)) })
	);

	let problem: string | undefined;
	if (hasCode(reopen.error, 'INVALID_STATE')) problem = t('months.reopenOrder');
	else if (reopen.error) problem = errorText(reopen.error);

	return (
		<>
			<ConfirmDialog
				isOpen={isOpen}
				onClose={() => {
					reopen.reset();
					onClose();
				}}
				title={t('months.reopenTitle', { month: formatMonth(month, i18n.language) })}
				confirmLabel={t('months.reopen')}
				onConfirm={() => void submit()}
				isPending={reopen.isPending}
				error={problem}
			>
				<p>{t('months.reopenText')}</p>
				<FormTextArea control={control} name="reason" label={t('months.reason')} />
			</ConfirmDialog>
			{reauth.dialog}
		</>
	);
}
