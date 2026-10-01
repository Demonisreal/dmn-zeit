import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSignOut } from '../../app/use-sign-out';
import { Button } from '../../components/ui/button';
import { sessionQuery } from '../../lib/api/auth';
import { AddPasskey } from './add-passkey';
import { RecoveryCodes } from './recovery-codes';
import styles from './security.module.css';
import { TotpSetup } from './totp-setup';

export function SetupFlow() {
	const { t } = useTranslation(['security', 'nav', 'common']);
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const signOut = useSignOut();
	const [codes, setCodes] = useState<string[] | null>(null);

	const finish = async () => {
		queryClient.setQueryData(
			sessionQuery.queryKey,
			(session) =>
				session && { ...session, security: { ...session.security, enrollmentPending: false } }
		);
		await navigate({ to: '/', replace: true });
	};
	const confirmed = (recoveryCodes: string[]) =>
		recoveryCodes.length > 0 ? setCodes(recoveryCodes) : void finish();

	if (codes) {
		return (
			<div className={styles.flow}>
				<h1>{t('setup.codesTitle')}</h1>
				<RecoveryCodes codes={codes} doneLabel={t('recovery.continue')} onDone={finish} />
			</div>
		);
	}

	return (
		<div className={styles.flow}>
			<h1>{t('nav:securitySetup')}</h1>
			<p className={styles.text}>{t('setup.intro')}</p>
			<section className={styles.step} aria-labelledby="setup-passkey">
				<h2 id="setup-passkey">{t('passkey.title')}</h2>
				<p className={styles.text}>{t('passkey.intro')}</p>
				<AddPasskey onCreated={(created) => confirmed(created.recoveryCodes)} />
			</section>
			<section className={styles.step} aria-labelledby="setup-totp">
				<h2 id="setup-totp">{t('totp.title')}</h2>
				<p className={styles.text}>{t('totp.intro')}</p>
				<TotpSetup onConfirmed={confirmed} />
			</section>
			<div className={styles.aside}>
				<Button variant="quiet" isPending={signOut.isPending} onPress={() => signOut.mutate()}>
					{t('common:logout')}
				</Button>
			</div>
		</div>
	);
}
