import type { ReactNode } from 'react';
import styles from './page-shell.module.css';

export function Page({ children }: { children: ReactNode }) {
	return <div className={styles.page}>{children}</div>;
}

type HeadProps = {
	children: ReactNode;
	className?: string | undefined;
};

export function PageHead({ children, className }: HeadProps) {
	return (
		<header className={className ? `${styles.head} ${className}` : styles.head}>{children}</header>
	);
}
