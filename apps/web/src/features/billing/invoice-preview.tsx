import { useEffect, useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import styles from './invoice-preview.module.css';

type Props = {
	invoiceId: string;
	variant: 'draft' | 'issued';
	refreshKey?: string | number;
};

const SLOW_LOAD_MS = 6000;

export function InvoicePreview({ invoiceId, variant, refreshKey }: Props) {
	const { t } = useTranslation(['billing', 'common']);
	const [loaded, setLoaded] = useState(false);
	const [slow, setSlow] = useState(false);
	const [reloadNonce, setReloadNonce] = useState(0);

	const src =
		variant === 'draft'
			? `/api/invoices/${invoiceId}/preview.pdf`
			: `/api/invoices/${invoiceId}/document`;
	const frameKey = `${refreshKey ?? ''}-${reloadNonce}`;

	useEffect(() => {
		setLoaded(false);
		setSlow(false);
		const timer = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS);
		return () => window.clearTimeout(timer);
	}, [frameKey, src]);

	return (
		<div className={styles.stage}>
			<div className={styles.scroll}>
				<div className={styles.paper} data-loaded={loaded} aria-busy={!loaded}>
					{!loaded && (
						<span className={styles.skeletonLayer}>
							<Skeleton width="100%" height="100%" />
						</span>
					)}
					<iframe
						key={frameKey}
						className={styles.frame}
						src={src}
						title={t('preview.frameTitle')}
						onLoad={() => setLoaded(true)}
					/>
				</div>
			</div>
			{slow && !loaded && (
				<div className={styles.retry} role="status">
					<Button variant="quiet" onPress={() => setReloadNonce((n) => n + 1)}>
						{t('common:retry')}
					</Button>
				</div>
			)}
			<VisuallyHidden>
				<a href={src} download>
					{t('preview.downloadLink')}
				</a>
			</VisuallyHidden>
		</div>
	);
}
