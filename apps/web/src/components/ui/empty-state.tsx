import type { ReactNode } from 'react';
import styles from './empty-state.module.css';

type Props = {
	title: string;
	children?: ReactNode;
	action?: ReactNode;
};

export function EmptyState({ title, children, action }: Props) {
	return (
		<div className={styles.empty}>
			<p className={styles.title}>{title}</p>
			{children && <p className={styles.text}>{children}</p>}
			{action && <div className={styles.action}>{action}</div>}
		</div>
	);
}
