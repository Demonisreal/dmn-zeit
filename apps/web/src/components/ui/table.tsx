import type { ReactNode } from 'react';
import styles from './table.module.css';

type Props = {
	label: string;
	children: ReactNode;
};

// cells with data-numeric are set in mono and right aligned, a row with data-current gets the red edge
export function Table({ label, children }: Props) {
	return (
		<table className={styles.table} aria-label={label}>
			{children}
		</table>
	);
}
