import type { ReactNode } from 'react';
import styles from './table.module.css';

type Props = {
	label: string;
	children: ReactNode;
};

export function Table({ label, children }: Props) {
	return (
		<table className={styles.table} aria-label={label}>
			{children}
		</table>
	);
}
