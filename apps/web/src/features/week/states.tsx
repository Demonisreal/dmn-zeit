import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { Skeleton } from '../../components/ui/skeleton';
import styles from './page.module.css';

export function TableLoading({ rows }: { rows: number }) {
	const { t } = useTranslation();
	return (
		<div className={styles.loading} role="status" aria-busy="true">
			<VisuallyHidden>{t('loading')}</VisuallyHidden>
			<Skeleton height="1.25rem" width="60%" />
			{Array.from({ length: rows }, (_, i) => (
				<Skeleton key={i} height="2.25rem" />
			))}
		</div>
	);
}

type Props = {
	error: unknown;
	onRetry: () => void;
};

export function LoadError({ error, onRetry }: Props) {
	const { t } = useTranslation(['common']);
	return (
		<Notice
			tone="error"
			action={
				<Button variant="secondary" onPress={onRetry}>
					{t('retry')}
				</Button>
			}
		>
			{t(errorKey(error))}
		</Notice>
	);
}
