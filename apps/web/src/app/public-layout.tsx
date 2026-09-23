import type { ReactNode } from 'react';
import { Brand } from './brand';
import { LangSwitch } from './lang-switch';
import styles from './public-layout.module.css';

type Props = {
	children: ReactNode;
};

export function PublicLayout({ children }: Props) {
	return (
		<>
			<header className={styles.top}>
				<div className={styles.wrap}>
					<Brand />
					<LangSwitch />
				</div>
			</header>
			<main className={`${styles.wrap} ${styles.main}`}>
				<div className={styles.column}>{children}</div>
			</main>
		</>
	);
}
