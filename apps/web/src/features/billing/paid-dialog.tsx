import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Invoice } from '@zeit/shared';
import { useState } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import css from '../../components/ui/dialog.module.css';
import { Notice } from '../../components/ui/notice';
import { useErrorText } from '../hr/error-text';
import { DateInputField } from '../hr/ui/date-field';
import { todayIso } from '../../lib/dates';
import { invoiceQuery, markPaid } from './api';
import { issueAt } from './fields';

const styles = css as Record<'overlay' | 'modal' | 'dialog' | 'body' | 'actions', string>;

type Props = {
	invoice: Invoice | null;
	onClose: () => void;
};

export function PaidDialog({ invoice, onClose }: Props) {
	const { t } = useTranslation('billing');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const [paidOn, setPaidOn] = useState(todayIso());

	const pay = useMutation({
		mutationFn: (id: string) => markPaid(id, { paidOn }),
		onSuccess: (next) => {
			queryClient.setQueryData(invoiceQuery(next.id).queryKey, next);
			close();
			// the "als bezahlt markieren" trigger is replaced by the paid state, react-aria has nothing left to refocus
			document.getElementById('main')?.focus();
		}
	});

	const dayIssue = issueAt(pay.error, 'paidOn');

	function close() {
		pay.reset();
		onClose();
	}

	return (
		<ModalOverlay
			isOpen={invoice !== null}
			onOpenChange={(open) => !open && close()}
			isDismissable={!pay.isPending}
			isKeyboardDismissDisabled={pay.isPending}
			className={styles.overlay}
		>
			<Modal className={styles.modal}>
				<Dialog role="alertdialog" aria-modal="true" className={styles.dialog}>
					{invoice && (
						<>
							<Heading slot="title">{t('paidDialog.title', { number: invoice.number ?? '' })}</Heading>
							<DateInputField
								label={t('paidDialog.date')}
								value={paidOn}
								onChange={(day) => {
									setPaidOn(day);
									pay.reset();
								}}
								error={dayIssue}
							/>
							{pay.error && !dayIssue && <Notice tone="error">{errorText(pay.error)}</Notice>}
							<div className={styles.actions}>
								<Button isDisabled={pay.isPending} onPress={close}>
									{t('cancel')}
								</Button>
								<Button
									variant="primary"
									isDisabled={paidOn === ''}
									isPending={pay.isPending}
									onPress={() => pay.mutate(invoice.id)}
								>
									{t('paidDialog.confirm')}
								</Button>
							</div>
						</>
					)}
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}
