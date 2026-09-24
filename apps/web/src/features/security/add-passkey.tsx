import { zodResolver } from '@hookform/resolvers/zod';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useMutation } from '@tanstack/react-query';
import { renamePasskeySchema, type PasskeyCreated, type RenamePasskeyInput } from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/field';
import { createPasskey, passkeyCreationOptions } from '../../lib/api/auth';
import { hasCode } from '../../lib/api/errors';
import { ErrorNotice } from './error-notice';
import { createPasskeyCredential } from './passkey';
import { ReauthDialog } from './reauth-dialog';
import styles from './security.module.css';
import { describeAgent } from './user-agent';

type Props = {
	onCreated: (created: PasskeyCreated) => void;
	onCancel?: () => void;
};

export function AddPasskey({ onCreated, onCancel }: Props) {
	const { t } = useTranslation('security');
	const { browser, os } = describeAgent(navigator.userAgent);
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(renamePasskeySchema),
		defaultValues: {
			name: browser && os ? t('sessions.deviceName', { browser, os }) : (os ?? browser ?? '')
		}
	});

	const create = useMutation({ mutationFn: createPasskey, onSuccess: onCreated });
	// the browser prompt and the upload are split, so a step-up in between does not ask twice
	const register = useMutation({
		mutationFn: async ({ name }: RenamePasskeyInput) => ({
			name,
			response: await createPasskeyCredential(await passkeyCreationOptions())
		}),
		onSuccess: (input) => create.mutate(input)
	});
	const error = register.error ?? create.error;

	if (!browserSupportsWebAuthn()) return <p className={styles.text}>{t('passkey.unsupported')}</p>;

	return (
		<>
			<form
				noValidate
				className={styles.flow}
				onSubmit={handleSubmit((input) => {
					create.reset();
					register.mutate(input);
				})}
			>
				<FormField
					control={control}
					name="name"
					label={t('passkey.name')}
					description={t('passkey.nameHint')}
					autoComplete="off"
				/>
				{error && <ErrorNotice error={error} />}
				<div className={styles.actions}>
					<Button type="submit" isPending={register.isPending || create.isPending}>
						{t('passkey.create')}
					</Button>
					{onCancel && (
						<Button variant="quiet" onPress={onCancel}>
							{t('cancel')}
						</Button>
					)}
				</div>
			</form>
			<ReauthDialog
				isOpen={hasCode(create.error, 'REAUTH_REQUIRED')}
				onClose={create.reset}
				onConfirmed={() => create.variables && create.mutate(create.variables)}
			/>
		</>
	);
}
