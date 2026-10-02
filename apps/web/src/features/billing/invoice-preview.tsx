import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../components/ui/skeleton';
import { LoadError } from '../../components/ui/states';
import { invoicePdfQuery } from './api';
import styles from './invoice-preview.module.css';

type Props = {
	invoiceId: string;
	variant: 'draft' | 'issued';
	version?: string;
};

export function InvoicePreview({ invoiceId, variant, version = '' }: Props) {
	const { t } = useTranslation('billing');
	const path =
		variant === 'draft' ? `/invoices/${invoiceId}/preview.pdf` : `/invoices/${invoiceId}/document`;
	const [touch] = useState(() => window.matchMedia('(pointer: coarse)').matches);
	const pdf = useQuery({ ...invoicePdfQuery(path, version), enabled: !touch });
	const [frame, setFrame] = useState<{ blob: Blob; url: string } | null>(null);
	const [shown, setShown] = useState(false);

	useEffect(() => {
		if (!pdf.data) return;
		const url = URL.createObjectURL(pdf.data);
		setFrame({ blob: pdf.data, url });
		setShown(false);
		return () => URL.revokeObjectURL(url);
	}, [pdf.data]);

	const open = (
		<a href={`/api${path}`} target="_blank" rel="noopener" className={styles.open}>
			{t('preview.open')}
		</a>
	);

	if (touch) return <div className={styles.stage}>{open}</div>;

	const url = frame !== null && frame.blob === pdf.data ? frame.url : null;
	const loaded = shown && url !== null;

	return (
		<div className={styles.stage}>
			{pdf.isError && !pdf.isFetching ? (
				<LoadError error={pdf.error} onRetry={() => void pdf.refetch()} />
			) : (
				<div className={styles.scroll}>
					<div className={styles.paper} data-loaded={loaded} aria-busy={!loaded}>
						{!loaded && (
							<span className={styles.skeletonLayer}>
								<Skeleton width="100%" height="100%" />
							</span>
						)}
						{url && (
							<iframe
								key={url}
								className={styles.frame}
								src={url}
								title={t('preview.frameTitle')}
								onLoad={() => setShown(true)}
							/>
						)}
					</div>
				</div>
			)}
			{open}
		</div>
	);
}
