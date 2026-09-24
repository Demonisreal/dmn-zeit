import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { renewRecoveryCodes, securityQuery } from '../../lib/api/auth';
import { hasCode } from '../../lib/api/errors';
import { ConfirmDialog } from './confirm-dialog';
import { ErrorNotice } from './error-notice';
import { ReauthDialog } from './reauth-dialog';
import { RecoveryCodes } from './recovery-codes';
import styles from './security.module.css';

type Props = {
	left: number;
	hasFactor: boolean;
	// fresh codes from this page, shown until the person confirms having stored them
	codes: string[] | null;
	onCodes: (recoveryCodes: string[] | null) => void;
};

export function RecoverySection({ left, hasFactor, codes, onCodes }: Props) {
	const { t } = useTranslation('security');
	const queryClient = useQueryClient();
	const [confirming, setConfirming] = useState(false);

	const renew = useMutation({
		mutationFn: renewRecoveryCodes,
		onSuccess: async ({ recoveryCodes }) => {
			setConfirming(false);
			onCodes(recoveryCodes);
			await queryClient.invalidateQueries({ queryKey: securityQuery.queryKey });
		}
	});
	const stepUp = hasCode(renew.error, 'REAUTH_REQUIRED');
	const close = () => {
		setConfirming(false);
		renew.reset();
	};

	return (
		<section className={styles.section} aria-labelledby="recovery">
			<div className={styles.sectionHead}>
				<h2 id="recovery">{t('recovery.title')}</h2>
				{hasFactor && !codes && (
					<Button onPress={() => setConfirming(true)}>{t('recovery.renew')}</Button>
				)}
			</div>
			<p className={styles.text}>{t('recovery.intro')}</p>
			{codes ? (
				<RecoveryCodes codes={codes} doneLabel={t('recovery.done')} onDone={() => onCodes(null)} />
			) : !hasFactor ? (
				<p className={styles.text}>{t('recovery.none')}</p>
			) : left <= 3 ? (
				<Notice tone="warning">
					{t('recovery.left', { count: left })} {t('recovery.lowHint')}
				</Notice>
			) : (
				<p>{t('recovery.left', { count: left })}</p>
			)}
			<ConfirmDialog
				isOpen={confirming && !stepUp}
				onClose={close}
				title={t('recovery.renewTitle')}
				confirmLabel={t('recovery.renew')}
				onConfirm={() => renew.mutate()}
				isPending={renew.isPending}
				error={renew.error && <ErrorNotice error={renew.error} />}
			>
				<p>{t('recovery.renewText')}</p>
			</ConfirmDialog>
			<ReauthDialog isOpen={stepUp} onClose={close} onConfirmed={() => renew.mutate()} />
		</section>
	);
}
