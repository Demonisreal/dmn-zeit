import type { ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { Notice } from '../../../components/ui/notice';
import css from './dialog.module.css';

const styles = css as Record<'overlay' | 'modal' | 'dialog' | 'body' | 'actions', string>;

type Props = {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	confirmLabel: string;
	onConfirm: () => void;
	isPending: boolean;
	error?: string | undefined;
};

export function ConfirmDialog({
	isOpen,
	onClose,
	title,
	children,
	confirmLabel,
	onConfirm,
	isPending,
	error
}: Props) {
	const { t } = useTranslation('hr');
	return (
		<ModalOverlay
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			isDismissable={!isPending}
			className={styles.overlay}
		>
			<Modal className={styles.modal}>
				<Dialog role="alertdialog" className={styles.dialog}>
					<Heading slot="title">{title}</Heading>
					<div className={styles.body}>{children}</div>
					{error && <Notice tone="error">{error}</Notice>}
					<div className={styles.actions}>
						<Button variant="secondary" isDisabled={isPending} onPress={onClose}>
							{t('cancel')}
						</Button>
						<Button variant="primary" isPending={isPending} onPress={onConfirm}>
							{confirmLabel}
						</Button>
					</div>
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}
