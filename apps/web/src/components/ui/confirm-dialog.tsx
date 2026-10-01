import type { ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from './button';
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
	error?: ReactNode;
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
	const { t } = useTranslation();
	return (
		<ModalOverlay
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			isDismissable={!isPending}
			isKeyboardDismissDisabled={isPending}
			className={styles.overlay}
		>
			<Modal className={styles.modal}>
				<Dialog role="alertdialog" aria-modal="true" className={styles.dialog}>
					<Heading slot="title">{title}</Heading>
					<div className={styles.body}>{children}</div>
					{error}
					<div className={styles.actions}>
						<Button isDisabled={isPending} onPress={onClose}>
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
