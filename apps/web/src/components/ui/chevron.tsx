import styles from './chevron.module.css';

type Props = {
	direction: 'left' | 'right' | 'down';
};

export function Chevron({ direction }: Props) {
	return (
		<svg
			className={styles.chevron}
			data-direction={direction}
			viewBox="0 0 16 16"
			width="16"
			height="16"
			aria-hidden="true"
		>
			<path
				d="M6 3.5 10.5 8 6 12.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
