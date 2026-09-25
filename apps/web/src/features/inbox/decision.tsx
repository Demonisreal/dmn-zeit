import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { noteSchema } from '@zeit/shared';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { FormTextArea } from '../../components/ui/field';
import { i18n } from '../../i18n';
import { hasCode } from '../../lib/api/errors';
import styles from './inbox.module.css';

const rejectForm = z.object({
	note: z
		.string()
		.refine((raw) => raw.trim() !== '', {
			error: () => i18n.t('inbox:decision.reasonRequired'),
			abort: true
		})
		.pipe(noteSchema)
});

type Props = {
	// names the request for screen readers, the buttons alone say nothing about which one
	label: string;
	approveLabel?: string | undefined;
	rejectLabel?: string | undefined;
	onApprove: () => Promise<void>;
	onReject: (note: string) => Promise<void>;
	onDone: (outcome: 'approved' | 'rejected') => void;
};

export function Decision({
	label,
	approveLabel,
	rejectLabel,
	onApprove,
	onReject,
	onDone
}: Props) {
	const { t } = useTranslation(['inbox', 'common']);
	const [rejecting, setRejecting] = useState(false);
	const rejectButton = useRef<HTMLButtonElement>(null);
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(rejectForm),
		defaultValues: { note: '' }
	});
	const approve = useMutation({ mutationFn: onApprove, onSuccess: () => onDone('approved') });
	const reject = useMutation({
		mutationFn: (note: string) => onReject(note),
		onSuccess: () => onDone('rejected')
	});
	const error = approve.error ?? reject.error;
	const busy = approve.isPending || reject.isPending;

	const failure = (err: Error) => {
		if (hasCode(err, 'FORBIDDEN')) return t('errors.forbidden');
		if (hasCode(err, 'INVALID_STATE')) return t('errors.invalidState');
		if (hasCode(err, 'PERIOD_LOCKED')) return t('errors.locked');
		if (hasCode(err, 'TIME_OVERLAP')) return t('errors.overlap');
		return t(errorKey(err));
	};

	return (
		<div className={styles.decision}>
			<div role="group" aria-label={label} className={styles.buttons}>
				<Button isPending={approve.isPending} isDisabled={busy} onPress={() => approve.mutate()}>
					{approveLabel ?? t('decision.approve')}
				</Button>
				<Button
					ref={rejectButton}
					isDisabled={busy}
					aria-expanded={rejecting}
					onPress={() => setRejecting(!rejecting)}
				>
					{rejectLabel ?? t('decision.reject')}
				</Button>
			</div>
			{rejecting && (
				<form
					noValidate
					className={styles.reject}
					onSubmit={handleSubmit(({ note }) => reject.mutate(note))}
				>
					<FormTextArea
						control={control}
						name="note"
						label={t('decision.reason')}
						rows={2}
						autoFocus
					/>
					<div className={styles.buttons}>
						<Button type="submit" isPending={reject.isPending}>
							{t('decision.send')}
						</Button>
						<Button
							variant="quiet"
							isDisabled={busy}
							onPress={() => {
								setRejecting(false);
								rejectButton.current?.focus();
							}}
						>
							{t('decision.keep')}
						</Button>
					</div>
				</form>
			)}
			{error && (
				<p role="alert" className={styles.error}>
					{failure(error)}
				</p>
			)}
		</div>
	);
}
