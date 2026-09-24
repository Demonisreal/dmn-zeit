import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { Skeleton } from '../../components/ui/skeleton';
import { securityQuery } from '../../lib/api/auth';
import { PasskeyList } from './passkey-list';
import { RecoverySection } from './recovery-section';
import styles from './security.module.css';
import { TotpSection } from './totp-section';

export function SecurityPage() {
	const { t } = useTranslation(['security', 'common', 'nav']);
	const overview = useQuery(securityQuery);
	const [codes, setCodes] = useState<string[] | null>(null);

	return (
		<div className={styles.page}>
			<header>
				<h1>{t('title')}</h1>
				<p className={styles.lead}>{t('intro')}</p>
			</header>
			{overview.isPending ? (
				<div className={styles.loading} role="status" aria-busy="true">
					<VisuallyHidden>{t('common:loading')}</VisuallyHidden>
					<Skeleton width="40%" height="1.5rem" />
					<Skeleton height="2.5rem" />
					<Skeleton height="2.5rem" />
					<Skeleton width="40%" height="1.5rem" />
					<Skeleton height="2.5rem" />
				</div>
			) : overview.isError ? (
				<Notice
					tone="error"
					action={<Button onPress={() => void overview.refetch()}>{t('common:retry')}</Button>}
				>
					{t(errorKey(overview.error))}
				</Notice>
			) : (
				<>
					<PasskeyList passkeys={overview.data.passkeys} onCodes={setCodes} />
					<TotpSection hasTotp={overview.data.hasTotp} onCodes={setCodes} />
					<RecoverySection
						left={overview.data.recoveryCodesLeft}
						hasFactor={overview.data.hasTotp || overview.data.passkeys.length > 0}
						codes={codes}
						onCodes={setCodes}
					/>
				</>
			)}
			<section className={styles.section} aria-labelledby="sessions">
				<h2 id="sessions">{t('nav:sessions')}</h2>
				<p className={styles.text}>{t('sessions.hint')}</p>
				<p>
					<Link to="/sessions">{t('sessions.link')}</Link>
				</p>
			</section>
		</div>
	);
}
