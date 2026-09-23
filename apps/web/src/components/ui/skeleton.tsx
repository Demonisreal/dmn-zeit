import styles from './skeleton.module.css';

type Props = {
	width?: string;
	height?: string;
};

// decoration only, the region that loads carries aria-busy and its own label
export function Skeleton({ width = '100%', height = '1rem' }: Props) {
	return <span className={styles.skeleton} style={{ width, height }} aria-hidden="true" />;
}
