import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { passkeyLogin, passkeyLoginOptions, sessionQuery } from '../../lib/api/auth';
import { ErrorNotice } from './error-notice';
import { signWithPasskey } from './passkey';
import styles from './security.module.css';

type Props = {
	next?: string | undefined;
};

export function PasskeyLogin({ next }: Props) {
	const { t } = useTranslation('auth');
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const signIn = useMutation({
		mutationFn: async () => passkeyLogin(await signWithPasskey(await passkeyLoginOptions())),
		onSuccess: async (session) => {
			queryClient.setQueryData(sessionQuery.queryKey, session);
			await navigate({ href: next ?? '/' });
		}
	});

	if (!browserSupportsWebAuthn()) return null;

	return (
		<div className={styles.flow}>
			<div className={styles.actions}>
				<Button isPending={signIn.isPending} onPress={() => signIn.mutate()}>
					{t('login.passkey')}
				</Button>
			</div>
			{signIn.error && (
				<ErrorNotice
					error={signIn.error}
					texts={{ INVALID_CREDENTIALS: t('login.passkeyUnknown') }}
				/>
			)}
		</div>
	);
}
