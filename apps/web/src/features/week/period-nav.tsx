import type { KeyboardEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Chevron } from './chevron';
import styles from './page.module.css';

type Props = {
	label: string;
	range?: string;
	previous: string;
	next: string;
	current: string;
	isCurrent: boolean;
	onStep: (by: number) => void;
	onReset: () => void;
};

export function PeriodNav({
	label,
	range,
	previous,
	next,
	current,
	isCurrent,
	onStep,
	onReset
}: Props) {
	// the arrow keys page on as long as focus sits on one of these buttons
	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'ArrowLeft') onStep(-1);
		if (e.key === 'ArrowRight') onStep(1);
	};

	return (
		<div className={styles.period} role="group" aria-label={label} onKeyDown={onKeyDown}>
			<span className={styles.steps}>
				<Button variant="quiet" aria-label={previous} onPress={() => onStep(-1)}>
					<Chevron direction="left" />
				</Button>
				<Button variant="quiet" aria-label={next} onPress={() => onStep(1)}>
					<Chevron direction="right" />
				</Button>
			</span>
			<p className={styles.periodText} aria-live="polite">
				<span className={styles.periodLabel}>{label}</span>
				{range && <span className={styles.range}>{range}</span>}
			</p>
			{!isCurrent && (
				<Button variant="secondary" onPress={onReset}>
					{current}
				</Button>
			)}
		</div>
	);
}
