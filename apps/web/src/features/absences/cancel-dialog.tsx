import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Absence } from '@zeit/shared';
import { useState } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import css from '../../components/ui/dialog.module.css';
import { TextAreaField } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { hasCode } from '../../lib/api/errors';
import { cancelAbsence, refreshAbsences } from './api';
import { formatPeriod } from './dates';

const styles = css as Record<'overlay' | 'modal' | 'dialog' | 'actions', string>;

type Props = {
	absence: Absence | null;
	onClose: () => void;
};

export function CancelDialog({ absence, onClose }: Props) {
	const { t, i18n } = useTranslation(['absences', 'common']);
	const queryClient = useQueryClient();
	const [note, setNote] = useState('');
	const cancel = useMutation({
		mutationFn: (id: string) => cancelAbsence(id, note.trim() || undefined),
		onSuccess: async () => {
			await refreshAbsences(queryClient);
			close();
		}
	});

	function close() {
		setNote('');
		cancel.reset();
		onClose();
	}

	const failure = (err: Error) => {
		if (hasCode(err, 'INVALID_STATE')) return t('errors.invalidState');
		if (hasCode(err, 'VALIDATION')) return t('errors.validation');
		return t(errorKey(err));
	};

	return (
		<ModalOverlay
			isOpen={absence !== null}
			onOpenChange={(open) => !open && close()}
			isDismissable={!cancel.isPending}
			isKeyboardDismissDisabled={cancel.isPending}
			className={styles.overlay}
		>
			<Modal className={styles.modal}>
				<Dialog role="alertdialog" className={styles.dialog}>
					{absence && (
						<>
							<Heading slot="title">{t('cancel.title')}</Heading>
							<p>
								{t('cancel.body', {
									type: t(`type.${absence.type}`),
									period: formatPeriod(absence.startDate, absence.endDate, i18n.language)
								})}
							</p>
							<TextAreaField
								label={t('cancel.note')}
								rows={2}
								maxLength={500}
								value={note}
								onChange={setNote}
							/>
							{cancel.error && <Notice tone="error">{failure(cancel.error)}</Notice>}
							<div className={styles.actions}>
								<Button variant="secondary" autoFocus isDisabled={cancel.isPending} onPress={close}>
									{t('cancel.keep')}
								</Button>
								<Button
									variant="primary"
									isPending={cancel.isPending}
									onPress={() => cancel.mutate(absence.id)}
								>
									{t('cancel.confirm')}
								</Button>
							</div>
						</>
					)}
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}
