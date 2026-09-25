import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Tag } from '../../components/ui/tag';
import { removeTotp, securityQuery } from '../../lib/api/auth';
import { hasCode } from '../../lib/api/errors';
import { ErrorNotice } from './error-notice';
import { ReauthDialog } from './reauth-dialog';
import styles from './security.module.css';
import { TotpSetup } from './totp-setup';

type Props = {
	hasTotp: boolean;
	onCodes: (recoveryCodes: string[]) => void;
};

export function TotpSection({ hasTotp, onCodes }: Props) {
	const { t } = useTranslation('security');
	const queryClient = useQueryClient();
	const [confirming, setConfirming] = useState(false);
	const heading = useRef<HTMLHeadingElement>(null);
	const refresh = () => queryClient.invalidateQueries({ queryKey: securityQuery.queryKey });

	const remove = useMutation({
		mutationFn: removeTotp,
		onSuccess: async () => {
			setConfirming(false);
			await refresh();
			// the remove button is gone now, the setup takes its place
			heading.current?.focus();
		}
	});
	const stepUp = hasCode(remove.error, 'REAUTH_REQUIRED');
	const close = () => {
		setConfirming(false);
		remove.reset();
	};

	return (
		<section className={styles.section} aria-labelledby="totp">
			<div className={styles.sectionHead}>
				<div className={styles.title}>
					<h2 id="totp" ref={heading} tabIndex={-1} className={styles.anchor}>
						{t('totp.title')}
					</h2>
					<Tag tone={hasTotp ? 'success' : 'neutral'}>{t(hasTotp ? 'totp.on' : 'totp.off')}</Tag>
				</div>
				{hasTotp && <Button onPress={() => setConfirming(true)}>{t('totp.remove')}</Button>}
			</div>
			<p className={styles.text}>{t('totp.intro')}</p>
			{!hasTotp && (
				<TotpSetup
					onConfirmed={async (recoveryCodes) => {
						if (recoveryCodes.length > 0) onCodes(recoveryCodes);
						await refresh();
						// fresh codes take the focus themselves
						if (recoveryCodes.length === 0) heading.current?.focus();
					}}
				/>
			)}
			<ConfirmDialog
				isOpen={confirming && !stepUp}
				onClose={close}
				title={t('totp.removeTitle')}
				confirmLabel={t('totp.remove')}
				onConfirm={() => remove.mutate()}
				isPending={remove.isPending}
				error={
					remove.error && (
						<ErrorNotice error={remove.error} texts={{ INVALID_STATE: t('lastFactor') }} />
					)
				}
			>
				<p>{t('totp.removeText')}</p>
			</ConfirmDialog>
			<ReauthDialog isOpen={stepUp} onClose={close} onConfirmed={() => remove.mutate()} />
		</section>
	);
}
