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
import { Checkbox } from '../../components/ui/checkbox';
import dialogCss from '../../components/ui/dialog.module.css';
import { Notice } from '../../components/ui/notice';
import { formatCents } from '../../i18n/format';
import { sessionQuery } from '../../lib/api/auth';
import { markTourStep } from '../demo/tour';
import { useErrorText } from '../hr/error-text';
import styles from '../hr/ui/page.module.css';
import { useReauth } from '../security/reauth-dialog';
import formCss from '../week/form.module.css';
import { invoiceQuery, issueInvoice } from './api';
import { blockersOf } from './fields';
import editorCss from './invoice-editor.module.css';

const dialog = dialogCss as Record<'overlay' | 'modal' | 'dialog' | 'body' | 'actions', string>;
const css = editorCss as Record<'formatGroup' | 'formatOption' | 'formatHint' | 'blockers', string>;
const form = formCss as Record<'radio', string>;

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
	const [picked, setPicked] = useState<InvoiceFormat | null>(null);
	const format = picked ?? invoice.format;
	const [timersChecked, setTimersChecked] = useState(false);
	const longTimers = invoice.hints.includes('long_timer_entry');

	const issue = useMutation({
		mutationFn: () => issueInvoice(invoice.id, { format, longTimersChecked: timersChecked }),
		onSuccess: async (issued) => {
			queryClient.setQueryData(invoiceQuery(issued.id).queryKey, issued);
			close();
			const session = queryClient.getQueryData(sessionQuery.queryKey);
			if (session?.mode === 'demo' && session.tenant.workspace === 'solo') markTourStep('invoice');
			document.getElementById('main')?.focus();
			await Promise.all(
				[['invoices'], ['revenue'], ['unbilled']].map((queryKey) =>
					queryClient.invalidateQueries({ queryKey })
				)
			);
		}
	});

	const refused = blockersOf(issue.error);
	const blockers = refused ?? (format === invoice.format ? invoice.blockers : []);

	function close() {
		issue.reset();
		setPicked(null);
		setTimersChecked(false);
		onClose();
	}

	function choose(next: InvoiceFormat) {
		issue.reset();
		setPicked(next);
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
								onChange={(value) => choose(value as InvoiceFormat)}
								isDisabled={issue.isPending}
								className={css.formatGroup}
							>
								<Label>{t('invoiceEditor.format')}</Label>
								{invoiceFormats.map((candidate) => (
									<div key={candidate} className={css.formatOption}>
										<Radio
											value={candidate}
											aria-describedby={`invoice-format-hint-${candidate}`}
											className={form.radio}
										>
											{t(`settings.formats.${candidate}`)}
										</Radio>
										<span id={`invoice-format-hint-${candidate}`} className={css.formatHint}>
											{t(`invoiceEditor.formatHints.${candidate}`)}
										</span>
									</div>
								))}
							</RadioGroup>
							{longTimers && (
								<Checkbox
									isSelected={timersChecked}
									onChange={(checked) => {
										issue.reset();
										setTimersChecked(checked);
									}}
									isDisabled={issue.isPending}
								>
									{t('invoiceEditor.longTimersChecked')}
								</Checkbox>
							)}
							{blockers.length > 0 && (
								<Notice tone={refused ? 'error' : 'warning'}>
									<ul id="issue-blockers" className={css.blockers}>
										{blockers.map((code) => (
											<li key={code}>{t(`invoiceEditor.blockers.${code}`, code)}</li>
										))}
									</ul>
								</Notice>
							)}
							<p>{t('invoiceEditor.issueWarning')}</p>
						</div>
						{issue.error && !refused && <Notice tone="error">{errorText(issue.error)}</Notice>}
						<div className={dialog.actions}>
							<Button isDisabled={issue.isPending} onPress={close}>
								{t('cancel')}
							</Button>
							<Button
								variant="primary"
								isPending={issue.isPending}
								onPress={() => issue.mutate(undefined, { onError: reauth.onError(() => issue.mutate()) })}
								{...(blockers.length > 0 ? { 'aria-describedby': 'issue-blockers' } : {})}
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
