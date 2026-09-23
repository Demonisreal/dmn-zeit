import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './auth.module.css';

type Props = {
	text: string;
	action?: ReactNode;
};

export function LinkInvalid({ text, action }: Props) {
	const { t } = useTranslation('auth');
	return (
		<div className={styles.form}>
			<h1>{t('linkInvalid')}</h1>
			<p className={styles.intro}>{text}</p>
			<div className={styles.actions}>
				{action}
				<Link to="/login">{t('backToLogin')}</Link>
			</div>
		</div>
	);
}
