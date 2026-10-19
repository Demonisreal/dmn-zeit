import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { User } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { Notice } from '../../../components/ui/notice';
import { useErrorText } from '../../hr/error-text';
import styles from '../../hr/ui/page.module.css';
import { useReauth } from '../../security/reauth-dialog';
import { inviteUser, resetUserMfa, setUserDisabled } from '../api';

type Props = {
	user: User;
};

export function AccountActions({ user }: Props) {
	const { t } = useTranslation('admin');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const reauth = useReauth();
	const [asking, setAsking] = useState<'disable' | 'mfa' | null>(null);

	const resend = useMutation({ mutationFn: () => inviteUser(user.id) });

	const lock = useMutation({
		mutationFn: (disabled: boolean) => setUserDisabled(user.id, disabled),
		onSuccess: async () => {
			setAsking(null);
			await queryClient.invalidateQueries({ queryKey: ['users'] });
		}
	});

	const resetMfa = useMutation({
		mutationFn: () => resetUserMfa(user.id),
		onSuccess: () => setAsking(null)
	});

	const setDisabled = (disabled: boolean) =>
		lock.mutate(disabled, { onError: reauth.onError(() => lock.mutate(disabled)) });

	const closeDialog = () => {
		setAsking(null);
		lock.reset();
		resetMfa.reset();
	};

	return (
		<section className={styles.section} aria-labelledby={`account-${user.id}`}>
			<h3 id={`account-${user.id}`} className={styles.small}>
				{t('users.account')}
			</h3>
			<div className={styles.actions}>
				{user.status === 'invited' && (
					<Button
						variant="secondary"
						isPending={resend.isPending}
						onPress={() =>
							resend.mutate(undefined, { onError: reauth.onError(() => resend.mutate()) })
						}
					>
						{t('users.resend')}
					</Button>
				)}
				{user.status === 'active' && (
					<Button variant="secondary" onPress={() => setAsking('mfa')}>
						{t('users.resetMfa')}
					</Button>
				)}
				{user.status === 'disabled' ? (
					<Button variant="secondary" isPending={lock.isPending} onPress={() => setDisabled(false)}>
						{t('users.enable')}
					</Button>
				) : (
					<Button variant="secondary" onPress={() => setAsking('disable')}>
						{t('users.disable')}
					</Button>
				)}
			</div>
			{resend.isSuccess && <Notice tone="success">{t('users.resent')}</Notice>}
			{resetMfa.isSuccess && <Notice tone="success">{t('users.mfaReset')}</Notice>}
			{resend.error && <Notice tone="error">{errorText(resend.error)}</Notice>}
			{asking === null && lock.error && <Notice tone="error">{errorText(lock.error)}</Notice>}

			<ConfirmDialog
				isOpen={asking === 'disable'}
				onClose={closeDialog}
				title={t('users.disableTitle', { name: user.displayName })}
				confirmLabel={t('users.disable')}
				onConfirm={() => setDisabled(true)}
				isPending={lock.isPending}
				error={lock.error && <Notice tone="error">{errorText(lock.error)}</Notice>}
			>
				<p>{t('users.disableText')}</p>
			</ConfirmDialog>
			<ConfirmDialog
				isOpen={asking === 'mfa'}
				onClose={closeDialog}
				title={t('users.resetMfaTitle', { name: user.displayName })}
				confirmLabel={t('users.resetMfa')}
				onConfirm={() =>
					resetMfa.mutate(undefined, { onError: reauth.onError(() => resetMfa.mutate()) })
				}
				isPending={resetMfa.isPending}
				error={resetMfa.error && <Notice tone="error">{errorText(resetMfa.error)}</Notice>}
			>
				<p>{t('users.resetMfaText')}</p>
			</ConfirmDialog>
			{reauth.dialog}
		</section>
	);
}
