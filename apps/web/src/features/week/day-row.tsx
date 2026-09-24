import type { Day } from '@zeit/shared';
import type { ReactNode } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Tag } from '../../components/ui/tag';
import { formatMinutes, formatTime } from '../../i18n/format';
import { Chevron } from './chevron';
import { DayBarCell } from './day-bar-cell';
import styles from './day-table.module.css';
import { minuteOn, shortDate, weekdayShort } from './dates';
import { paragraph } from './explain';

type Props = {
	day: Day;
	// minutes the running entry has grown since the days were fetched
	extra: number;
	now: number;
	isToday: boolean;
	isFuture: boolean;
	isOpen: boolean;
	onToggle: () => void;
	children: ReactNode;
};

export function DayRow({ day, extra, now, isToday, isFuture, isOpen, onToggle, children }: Props) {
	const { t, i18n } = useTranslation('week');
	const lng = i18n.language;
	const first = day.entries[0];
	const last = day.entries.at(-1);
	const free = day.entries.length === 0 && day.target.minutes === 0 && day.workedMinutes === 0;
	const counted = !isFuture && !free;
	const detailId = `day-${day.date}`;
	const flagged = day.findings.some((finding) => finding.severity === 'warning' && !finding.ack);

	return (
		<>
			<tr data-current={isToday || undefined} data-free={free || undefined} className={styles.row}>
				<th scope="row" className={styles.day}>
					<button
						type="button"
						className={styles.toggle}
						aria-expanded={isOpen}
						aria-controls={isOpen ? detailId : undefined}
						aria-current={isToday ? 'date' : undefined}
						data-flag={flagged || undefined}
						onClick={onToggle}
					>
						<Chevron direction={isOpen ? 'down' : 'right'} />
						<span className={styles.dayName}>{weekdayShort(day.date, lng)}</span>
						<span className={styles.dayDate}>{shortDate(day.date, lng)}</span>
						<VisuallyHidden>, {t('row.toggle')}</VisuallyHidden>
					</button>
				</th>
				<td className={styles.barCol}>
					<DayBarCell day={day} now={now} />
				</td>
				<td data-numeric className={styles.wide}>
					{first && formatTime(first.startedAt, lng)}
				</td>
				<td data-numeric className={styles.wide}>
					{last &&
						(last.endedAt ? (
							<>
								{formatTime(last.endedAt, lng)}
								{minuteOn(last.endedAt, day.date) >= 24 * 60 && (
									<span className={styles.nextDay}>
										<span aria-hidden="true">+1</span>
										<VisuallyHidden>{t('detail.nextDay')}</VisuallyHidden>
									</span>
								)}
							</>
						) : (
							<span className={styles.running}>{t('row.running')}</span>
						))}
				</td>
				<td data-numeric className={styles.wide}>
					{day.entries.length > 0 && formatMinutes(day.breakMinutes)}
				</td>
				<td data-numeric data-toggle onClick={onToggle}>
					{counted && formatMinutes(day.workedMinutes + extra)}
				</td>
				<td data-numeric className={styles.mid}>
					{day.target.minutes > 0 && formatMinutes(day.target.minutes)}
				</td>
				<td data-numeric data-toggle onClick={onToggle}>
					{counted && formatMinutes(day.diffMinutes + extra, { signed: true })}
				</td>
				<td className={styles.mid} data-toggle onClick={onToggle}>
					<Notices day={day} />
				</td>
			</tr>
			{isOpen && (
				<tr className={styles.detailRow}>
					<td id={detailId} colSpan={9}>
						{children}
					</td>
				</tr>
			)}
		</>
	);
}

function Notices({ day }: { day: Day }) {
	const { t } = useTranslation('week');
	// two findings under the same paragraph share one tag, red only while one is still open
	const paragraphs = new Map<string, boolean>();
	for (const finding of day.findings) {
		const label = paragraph(finding.code);
		const open = finding.severity === 'warning' && !finding.ack;
		paragraphs.set(label, (paragraphs.get(label) ?? false) || open);
	}

	return (
		<span className={styles.tags}>
			{[...paragraphs].map(([label, open]) => (
				<Tag key={label} tone={open ? 'error' : 'neutral'}>
					{label}
				</Tag>
			))}
			{day.absence && <Tag>{t(`absence.${day.absence.type}`)}</Tag>}
			{day.holiday && <Tag>{t('detail.holiday')}</Tag>}
		</span>
	);
}
