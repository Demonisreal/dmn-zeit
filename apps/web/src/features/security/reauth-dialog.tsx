import { zodResolver } from '@hookform/resolvers/zod';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reauthSchema, type ReauthInput } from '@zeit/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/field';
import {
	reauth,
	reauthPasskeyOptions,
	reauthWithPasskey,
	securityQuery,
	sessionQuery
} from '../../lib/api/auth';
import { hasCode } from '../../lib/api/errors';
import css from './dialog.module.css';
import { ErrorNotice } from './error-notice';
import { signWithPasskey } from './passkey';

// react-aria refuses className={undefined}, naming the classes keeps them typed as plain strings
const styles = css as Record<'overlay' | 'modal' | 'dialog' | 'body' | 'actions' | 'alt', string>;

type Props = {
	isOpen: boolean;
	onClose: () => void;
	// runs once the step-up went through, usually to send the refused request again
	onConfirmed: () => void;
};

export function ReauthDialog({ isOpen, onClose, onConfirmed }: Props) {
	return (
		<ModalOverlay
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			isDismissable
			className={styles.overlay}
		>
			<Modal className={styles.modal}>
				<Dialog className={styles.dialog}>
					<ReauthForm onClose={onClose} onConfirmed={onConfirmed} />
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}

// callers pass onError(retry) to mutate; a REAUTH_REQUIRED answer opens the dialog and retries after
export function useReauth() {
	const [retry, setRetry] = useState<(() => void) | null>(null);

	const onError = (again: () => void) => (err: Error) => {
		if (hasCode(err, 'REAUTH_REQUIRED')) setRetry(() => again);
	};

	const dialog = (
		<ReauthDialog
			isOpen={retry !== null}
			onClose={() => setRetry(null)}
			onConfirmed={() => {
				setRetry(null);
				retry?.();
			}}
		/>
	);

	return { onError, dialog };
}

const withPasskey = async () =>
	reauthWithPasskey(await signWithPasskey(await reauthPasskeyOptions()));

function ReauthForm({ onClose, onConfirmed }: Omit<Props, 'isOpen'>) {
	const { t } = useTranslation('security');
	const queryClient = useQueryClient();
	const factors = useQuery(securityQuery);
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(reauthSchema),
		defaultValues: { password: '', code: '' }
	});

	const confirm = useMutation({
		mutationFn: (input: ReauthInput | 'passkey') =>
			input === 'passkey' ? withPasskey() : reauth(input),
		onSuccess: ({ reauthUntil }) => {
			queryClient.setQueryData(
				sessionQuery.queryKey,
				(session) => session && { ...session, security: { ...session.security, reauthUntil } }
			);
			queryClient.setQueryData(
				securityQuery.queryKey,
				(overview) => overview && { ...overview, reauthUntil }
			);
		}
	});
	// the callback only fires while the dialog is still open, a dismissed dialog retries nothing
	const send = (input: ReauthInput | 'passkey') =>
		confirm.mutate(input, { onSuccess: onConfirmed });

	// until the overview is there both ways are offered, the server knows which one holds
	const hasTotp = factors.data?.hasTotp ?? true;
	const hasPasskey = browserSupportsWebAuthn() && (factors.data?.passkeys.length ?? 1) > 0;
	const viaPasskey = confirm.variables === 'passkey';

	return (
		<form noValidate className={styles.body} onSubmit={handleSubmit(send)}>
			<Heading slot="title">{t('reauth.title')}</Heading>
			<p>{t('reauth.intro')}</p>
			{hasTotp && (
				<>
					<FormField
						control={control}
						name="password"
						label={t('reauth.password')}
						type="password"
						autoComplete="current-password"
						autoFocus
					/>
					<FormField
						control={control}
						name="code"
						label={t('reauth.code')}
						inputMode="numeric"
						autoComplete="one-time-code"
					/>
				</>
			)}
			{confirm.error && (
				<ErrorNotice
					error={confirm.error}
					texts={{ INVALID_CREDENTIALS: t(viaPasskey ? 'reauth.wrongPasskey' : 'reauth.wrong') }}
				/>
			)}
			<div className={styles.actions}>
				{hasPasskey && (
					<span className={hasTotp ? styles.alt : undefined}>
						<Button
							variant={hasTotp ? 'quiet' : 'primary'}
							isPending={confirm.isPending && viaPasskey}
							isDisabled={confirm.isPending && !viaPasskey}
							onPress={() => send('passkey')}
						>
							{t('reauth.passkey')}
						</Button>
					</span>
				)}
				<Button onPress={onClose}>{t('cancel')}</Button>
				{hasTotp && (
					<Button
						type="submit"
						variant="primary"
						isPending={confirm.isPending && !viaPasskey}
						isDisabled={confirm.isPending && viaPasskey}
					>
						{t('reauth.submit')}
					</Button>
				)}
			</div>
		</form>
	);
}
