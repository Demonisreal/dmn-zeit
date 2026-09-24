import type { ReactNode } from 'react';
import { Button } from '../../../components/ui/button';
import styles from './period-stepper.module.css';

type Props = {
	label: string;
	previousLabel: string;
	nextLabel: string;
	onPrevious: () => void;
	onNext: () => void;
	children: ReactNode;
};

export function PeriodStepper({
	label,
	previousLabel,
	nextLabel,
	onPrevious,
	onNext,
	children
}: Props) {
	return (
		<div role="group" aria-label={label} className={styles.stepper}>
			<Button variant="quiet" aria-label={previousLabel} onPress={onPrevious}>
				<span className={`${styles.chevron} ${styles.back}`} aria-hidden="true" />
			</Button>
			<span className={styles.current} aria-live="polite">
				{children}
			</span>
			<Button variant="quiet" aria-label={nextLabel} onPress={onNext}>
				<span className={styles.chevron} aria-hidden="true" />
			</Button>
		</div>
	);
}
