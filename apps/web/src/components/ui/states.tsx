import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from './button';
import { Notice } from './notice';
import { Skeleton } from './skeleton';
import styles from './states.module.css';

export function Loading({ rows = 4 }: { rows?: number }) {
	const { t } = useTranslation();
	return (
		<div className={styles.loading} role="status" aria-busy="true">
			<VisuallyHidden>{t('loading')}</VisuallyHidden>
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
