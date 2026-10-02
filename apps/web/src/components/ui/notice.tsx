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

function Box({ tone = 'info', children, action, role }: Props & { role?: 'alert' | 'status' }) {
	const { t } = useTranslation();
	return (
		<div className={styles.notice} role={role}>
			<Tag tone={tagTone[tone]}>{t(`notice.${tone}`)}</Tag>
			<div className={styles.body}>{children}</div>
			{action && <div className={styles.action}>{action}</div>}
		</div>
	);
}

export function Notice(props: Props) {
	return <Box {...props} role={props.tone === 'error' ? 'alert' : 'status'} />;
}

export function SavedNotice({ shown, children }: { shown: boolean; children: ReactNode }) {
	return (
		<div role="status" className={styles.live}>
			{shown && <Box tone="success">{children}</Box>}
		</div>
	);
}
