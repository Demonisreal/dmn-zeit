import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from './button';
import { Chevron } from './chevron';
import styles from './period-nav.module.css';

type Props = {
	label: string;
	previous: string;
	next: string;
	onStep: (by: number) => void;
	children: ReactNode;
	range?: string;
	// title: the period stands in for the page heading, field: it sits in a row of filters
	variant?: 'title' | 'field';
	action?: ReactNode;
};

export function PeriodNav({
	label,
	previous,
	next,
	onStep,
	children,
	range,
	variant = 'field',
	action
}: Props) {
	// the arrow keys page on as long as focus sits on one of these buttons
	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'ArrowLeft') onStep(-1);
		if (e.key === 'ArrowRight') onStep(1);
	};
	const back = (
		<Button variant="quiet" aria-label={previous} onPress={() => onStep(-1)}>
			<Chevron direction="left" />
		</Button>
	);
	const forth = (
		<Button variant="quiet" aria-label={next} onPress={() => onStep(1)}>
			<Chevron direction="right" />
		</Button>
	);

	return (
		<div role="group" aria-label={label} className={styles[variant]} onKeyDown={onKeyDown}>
			{variant === 'title' ? (
				<>
					<span className={styles.steps}>
						{back}
						{forth}
					</span>
					<p className={styles.text} aria-live="polite">
						<span className={styles.label}>{children}</span>
						{range && <span className={styles.range}>{range}</span>}
					</p>
				</>
			) : (
				<>
					{back}
					<span className={styles.current} aria-live="polite">
						{children}
					</span>
					{forth}
				</>
			)}
			{action}
		</div>
	);
}
