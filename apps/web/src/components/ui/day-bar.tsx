import { useTranslation } from 'react-i18next';
import { formatClock, listFormat } from '../../i18n/format';
import styles from './day-bar.module.css';

export type DaySpan = {
	// minutes after local midnight, to runs past 1440 when a shift ends the next day
	from: number;
	to: number;
	tone?: 'running' | 'violation';
};

type Props = {
	spans: DaySpan[];
};

const start = 6 * 60;
const end = 22 * 60;
const hours = Array.from({ length: (end - start) / 60 }, (_, i) => i);

const percent = (minute: number) =>
	((Math.min(Math.max(minute, start), end) - start) / (end - start)) * 100;

export function DayBar({ spans }: Props) {
	const { t, i18n } = useTranslation();

	const described = spans.map((span) =>
		span.tone === 'running'
			? t('dayBar.open', { from: formatClock(span.from) })
			: t('dayBar.span', { from: formatClock(span.from), to: formatClock(span.to % (24 * 60)) })
	);
	const label =
		spans.length === 0
			? t('dayBar.empty')
			: t('dayBar.label', { spans: listFormat(i18n.language).format(described) });

	return (
		<div className={styles.bar} role="img" aria-label={label}>
			{spans.map((span) => (
				<span
					key={span.from}
					className={`${styles.span} ${span.tone ? styles[span.tone] : ''}`}
					style={{
						left: `${percent(span.from)}%`,
						width: `${percent(span.to) - percent(span.from)}%`
					}}
				/>
			))}
			<span className={styles.hours}>
				{hours.map((hour) => (
					<i key={hour} />
				))}
			</span>
		</div>
	);
}
