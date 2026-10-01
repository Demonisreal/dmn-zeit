import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoiceFormats, type Invoice, type InvoiceFormat } from '@zeit/shared';
import { useState } from 'react';
import {
	Dialog,
	Heading,
	Label,
	Modal,
	ModalOverlay,
	Radio,
	RadioGroup
} from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import dialogCss from '../../components/ui/dialog.module.css';
import { Notice } from '../../components/ui/notice';
import { formatCents } from '../../i18n/format';
import { useErrorText } from '../hr/error-text';
import styles from '../hr/ui/page.module.css';
import { useReauth } from '../security/reauth-dialog';
import { invoiceQuery, issueInvoice } from './api';
import editorCss from './invoice-editor.module.css';

// react-aria refuses className={undefined}, naming the classes keeps them typed as plain strings
const dialog = dialogCss as Record<'overlay' | 'modal' | 'dialog' | 'body' | 'actions', string>;
const css = editorCss as Record<'formatGroup' | 'formatOption' | 'formatHint', string>;

type Props = {
	invoice: Invoice;
	isOpen: boolean;
	onClose: () => void;
};

export function IssueDialog({ invoice, isOpen, onClose }: Props) {
	const { t, i18n } = useTranslation('billing');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const reauth = useReauth();
	// only pdf renders in this version, zugferd and xrechnung would stay without a document
	const [format, setFormat] = useState<InvoiceFormat>('pdf');

	const issue = useMutation({
		mutationFn: () => issueInvoice(invoice.id, { format }),
		onSuccess: async (issued) => {
			queryClient.setQueryData(invoiceQuery(issued.id).queryKey, issued);
			close();
			// issuing swaps the whole editor for the read-only view, so the "Ausstellen" trigger is already gone
			document.getElementById('main')?.focus();
			await Promise.all(
				[['invoices'], ['revenue'], ['unbilled']].map((queryKey) =>
					queryClient.invalidateQueries({ queryKey })
				)
			);
		}
	});

	function close() {
		issue.reset();
		onClose();
	}

	return (
		<>
			<ModalOverlay
				isOpen={isOpen}
				onOpenChange={(open) => !open && close()}
				isDismissable={!issue.isPending}
				isKeyboardDismissDisabled={issue.isPending}
				className={dialog.overlay}
			>
				<Modal className={dialog.modal}>
					<Dialog role="alertdialog" aria-modal="true" className={dialog.dialog}>
						<Heading slot="title">{t('invoiceEditor.issueTitle')}</Heading>
						<div className={dialog.body}>
							<dl className={styles.facts}>
								<dt>{t('invoicesList.client')}</dt>
								<dd>{invoice.buyer.name}</dd>
								<dt>{t('invoicesList.amount')}</dt>
								<dd className={styles.mono}>
									{formatCents(invoice.totals.grossCents, i18n.language)}
								</dd>
							</dl>
							<RadioGroup
								value={format}
								onChange={(value) => setFormat(value as InvoiceFormat)}
								className={css.formatGroup}
							>
								<Label>{t('invoiceEditor.format')}</Label>
								{invoiceFormats.map((candidate) => {
									const hintId = `invoice-format-hint-${candidate}`;
									return (
										<div key={candidate} className={css.formatOption}>
											<Radio
												value={candidate}
												isDisabled={candidate !== 'pdf'}
												{...(candidate === 'pdf' ? {} : { 'aria-describedby': hintId })}
											>
												{t(`settings.formats.${candidate}`)}
											</Radio>
											{candidate !== 'pdf' && (
												<span id={hintId} className={css.formatHint}>
													{t('invoiceEditor.formatLater')}
												</span>
											)}
										</div>
									);
								})}
							</RadioGroup>
							<p>{t('invoiceEditor.issueWarning')}</p>
						</div>
						{issue.error && <Notice tone="error">{errorText(issue.error)}</Notice>}
						<div className={dialog.actions}>
							<Button isDisabled={issue.isPending} onPress={close}>
								{t('cancel')}
							</Button>
							<Button
								variant="primary"
								isPending={issue.isPending}
								onPress={() => issue.mutate(undefined, { onError: reauth.onError(() => issue.mutate()) })}
							>
								{t('invoiceEditor.issueConfirm')}
							</Button>
						</div>
					</Dialog>
				</Modal>
			</ModalOverlay>
			{reauth.dialog}
		</>
	);
}
