import { Link } from '@tanstack/react-router';
import styles from './brand.module.css';

export function Brand() {
	return (
		<Link to="/" className={styles.brand}>
			<img src="/icon.svg" alt="" width="24" height="24" />
			<span>
				DMN<span className={styles.slash}>/</span>
				<span className={styles.soft}>Zeit</span>
			</span>
		</Link>
	);
}
