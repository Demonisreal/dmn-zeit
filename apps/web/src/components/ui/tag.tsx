import type { ReactNode } from 'react';
import styles from './tag.module.css';

type Props = {
	tone?: 'neutral' | 'pending' | 'error' | 'warning' | 'success';
	children: ReactNode;
};

export function Tag({ tone = 'neutral', children }: Props) {
	return <span className={`${styles.tag} ${styles[tone] ?? ''}`}>{children}</span>;
}
