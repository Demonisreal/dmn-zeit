import type { Day } from '@zeit/shared';
import { DayBar, type DaySpan } from '../../components/ui/day-bar';
import { minuteOn } from './dates';
import styles from './day-table.module.css';

type Props = {
	day: Day;
	now: number;
};

export function DayBarCell({ day, now }: Props) {
	const spans = day.entries.map((entry): DaySpan => {
		const from = minuteOn(entry.startedAt, day.date);
		const to = minuteOn(entry.endedAt ?? new Date(now).toISOString(), day.date);
		return entry.endedAt ? { from, to } : { from, to: Math.max(from, to), tone: 'running' };
	});
	const early = spans.some((span) => span.from < 6 * 60);
	const late = spans.some((span) => span.to > 22 * 60);

	return (
		<div className={styles.barCell}>
			<i className={styles.edge} data-on={early || undefined} aria-hidden="true" />
			<DayBar spans={spans} />
			<i className={styles.edge} data-on={late || undefined} aria-hidden="true" />
		</div>
	);
}
