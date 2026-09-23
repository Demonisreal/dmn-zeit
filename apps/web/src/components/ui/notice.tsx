import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './notice.module.css';
import { Tag } from './tag';

type Tone = 'info' | 'warning' | 'error' | 'success';

type Props = {
	tone?: Tone;
	children: ReactNode;
	action?: ReactNode;
};

const tagTone = {
	info: 'neutral',
	warning: 'warning',
	error: 'error',
	success: 'success'
} as const;

export function Notice({ tone = 'info', children, action }: Props) {
	const { t } = useTranslation();
	return (
		<div className={styles.notice} role={tone === 'error' ? 'alert' : 'status'}>
			<Tag tone={tagTone[tone]}>{t(`notice.${tone}`)}</Tag>
			<div className={styles.body}>{children}</div>
			{action && <div className={styles.action}>{action}</div>}
		</div>
	);
}
