import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Invoice } from '@zeit/shared';
import { useState } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import css from '../../components/ui/dialog.module.css';
import { TextAreaField } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { useErrorText } from '../hr/error-text';
import { useReauth } from '../security/reauth-dialog';
import { cancelInvoice, invoiceQuery } from './api';
import { blockersOf } from './fields';
import editorCss from './invoice-editor.module.css';

const styles = css as Record<'overlay' | 'modal' | 'dialog' | 'body' | 'actions', string>;

const MIN_REASON = 10;

type Props = {
	invoice: Invoice | null;
	onClose: () => void;
};

export function CancelDialog({ invoice, onClose }: Props) {
	const { t } = useTranslation('billing');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const reauth = useReauth();
	const [reason, setReason] = useState('');

	const cancel = useMutation({
		mutationFn: (id: string) => cancelInvoice(id, { reason: reason.trim() }),
		onSuccess: async (cancellation) => {
			queryClient.setQueryData(invoiceQuery(cancellation.id).queryKey, cancellation);
			if (invoice) await queryClient.invalidateQueries({ queryKey: invoiceQuery(invoice.id).queryKey });
			await queryClient.invalidateQueries({ queryKey: ['invoices'] });
			close();
			document.getElementById('main')?.focus();
		}
	});

	function close() {
		setReason('');
		cancel.reset();
		onClose();
	}

	const tooShort = reason.trim().length > 0 && reason.trim().length < MIN_REASON;
	const blockers = blockersOf(cancel.error);

	return (
		<>
			<ModalOverlay
				isOpen={invoice !== null}
				onOpenChange={(open) => !open && close()}
				isDismissable={!cancel.isPending}
				isKeyboardDismissDisabled={cancel.isPending}
				className={styles.overlay}
			>
				<Modal className={styles.modal}>
					<Dialog role="alertdialog" aria-modal="true" className={styles.dialog}>
						{invoice && (
							<>
								<Heading slot="title">
									{t('cancelDialog.title', { number: invoice.number ?? '' })}
								</Heading>
								<p>{t('cancelDialog.body')}</p>
								<TextAreaField
									label={t('cancelDialog.reason')}
									rows={3}
									maxLength={1000}
									value={reason}
									onChange={setReason}
									description={t('cancelDialog.reasonHint')}
									error={tooShort ? t('cancelDialog.reasonTooShort') : undefined}
								/>
								{blockers ? (
									<Notice tone="error">
										<ul className={editorCss.blockers}>
											{blockers.map((code) => (
												<li key={code}>{t(`invoiceEditor.blockers.${code}`, code)}</li>
											))}
										</ul>
									</Notice>
								) : (
									cancel.error && <Notice tone="error">{errorText(cancel.error)}</Notice>
								)}
								<div className={styles.actions}>
									<Button isDisabled={cancel.isPending} onPress={close}>
										{t('cancel')}
									</Button>
									<Button
										variant="primary"
										isDisabled={reason.trim().length < MIN_REASON}
										isPending={cancel.isPending}
										onPress={() =>
											cancel.mutate(invoice.id, {
												onError: reauth.onError(() => cancel.mutate(invoice.id))
											})
										}
									>
										{t('cancelDialog.confirm')}
									</Button>
								</div>
							</>
						)}
					</Dialog>
				</Modal>
			</ModalOverlay>
			{reauth.dialog}
		</>
	);
}
