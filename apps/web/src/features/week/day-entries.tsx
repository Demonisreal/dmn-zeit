import type { Day } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { Tag } from '../../components/ui/tag';
import { formatMinutes, formatTime } from '../../i18n/format';
import styles from './day-detail.module.css';
import { minuteOn } from './dates';
import { minutesSince } from './use-now';

type Props = {
	day: Day;
	now: number;
};

const minutesBetween = (from: string, to: string) =>
	Math.round((Date.parse(to) - Date.parse(from)) / 60_000);

// entries with the gaps between them, the gaps are what the break column adds up
export function DayEntries({ day, now }: Props) {
	const { t, i18n } = useTranslation('week');
	const time = (instant: string) =>
		formatTime(instant, i18n.language) +
		(minuteOn(instant, day.date) >= 24 * 60 ? ` (${t('detail.nextDay')})` : '');

	if (day.entries.length === 0) return <p className={styles.muted}>{t('detail.none')}</p>;

	const gapItem = (key: string, from: string, to: string) => {
		const gap = minutesBetween(from, to);
		return (
			<li key={`${key}-gap`} className={styles.gap}>
				<span>
					{t('detail.gap')}{' '}
					<span className={styles.mono}>
						{t('detail.span', { from: time(from), to: time(to) })}
					</span>
				</span>
				<span className={styles.amount}>{formatMinutes(gap)}</span>
				{gap < 15 && <span className={styles.hint}>{t('detail.gapShort')}</span>}
			</li>
		);
	};

	return (
		<>
			<ol className={styles.timeline}>
				{day.entries.flatMap((entry, i) => {
					const next = day.entries[i + 1];
					return [
						<li key={entry.id}>
							<span className={styles.mono}>
								{entry.endedAt
									? t('detail.span', { from: time(entry.startedAt), to: time(entry.endedAt) })
									: t('detail.since', { from: time(entry.startedAt) })}
							</span>
							{entry.source === 'correction' && <Tag>{t('source.correction')}</Tag>}
							{!entry.endedAt && <span className={styles.running}>{t('row.running')}</span>}
							<span className={styles.amount}>
								{formatMinutes(
									entry.endedAt
										? minutesBetween(entry.startedAt, entry.endedAt)
										: minutesSince(Date.parse(entry.startedAt), now)
								)}
							</span>
						</li>,
						entry.endedAt && next ? gapItem(entry.id, entry.endedAt, next.startedAt) : null
					];
				})}
			</ol>
			{day.entries.length > 1 && (
				<p className={styles.line}>
					<span>{t('detail.breaks')}</span>
					<span className={styles.amount}>{formatMinutes(day.breakMinutes)}</span>
				</p>
			)}
		</>
	);
}
