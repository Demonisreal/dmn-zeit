import type { Day } from '@zeit/shared';
import { memo, type ReactNode } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Chevron } from '../../components/ui/chevron';
import { Tag } from '../../components/ui/tag';
import { formatMinutes, formatTime } from '../../i18n/format';
import { DayBarCell } from './day-bar-cell';
import styles from './day-table.module.css';
import { minuteOn, shortDate, weekdayShort } from './dates';
import { paragraph } from './explain';

type Props = {
	day: Day;
	extra: number;
	now: number;
	isToday: boolean;
	isFuture: boolean;
	isOpen: boolean;
	onToggle: (date: string) => void;
	children: ReactNode;
};

const sameRow = (prev: Props, next: Props) =>
	!prev.isOpen &&
	!next.isOpen &&
	(Object.keys(next) as (keyof Props)[]).every(
		(key) => key === 'children' || prev[key] === next[key]
	);

export const DayRow = memo(function DayRow({
	day,
	extra,
	now,
	isToday,
	isFuture,
	isOpen,
	onToggle,
	children
}: Props) {
	const { t, i18n } = useTranslation('week');
	const lng = i18n.language;
	const first = day.entries[0];
	const last = day.entries.at(-1);
	const free = day.entries.length === 0 && day.target.minutes === 0 && day.workedMinutes === 0;
	const counted = !isFuture && !free;
	const detailId = `day-${day.date}`;
	const flagged = day.findings.some((finding) => finding.severity === 'warning' && !finding.ack);
	const remaining = isToday ? Math.max(0, -(day.diffMinutes + extra)) : 0;
	const toggle = () => onToggle(day.date);

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
						onClick={toggle}
					>
						<Chevron direction={isOpen ? 'down' : 'right'} />
						<span className={styles.dayName}>{weekdayShort(day.date, lng)}</span>
						<span className={styles.dayDate}>{shortDate(day.date, lng)}</span>
						{flagged && (
							<span className={styles.flag}>
								<span aria-hidden="true">§</span>
								<VisuallyHidden>, {t('row.flag')}</VisuallyHidden>
							</span>
						)}
						<VisuallyHidden>, {t('row.toggle')}</VisuallyHidden>
					</button>
				</th>
				<td className={styles.barCol}>
					<DayBarCell day={day} now={now} />
				</td>
				<td data-numeric data-priority="wide">
					{first && formatTime(first.startedAt, lng)}
				</td>
				<td data-numeric data-priority="wide">
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
				<td data-numeric data-priority="wide">
					{day.entries.length > 0 && formatMinutes(day.breakMinutes)}
				</td>
				<td data-numeric data-toggle onClick={toggle}>
					{counted && formatMinutes(day.workedMinutes + extra)}
				</td>
				<td data-numeric data-priority="mid">
					{day.target.minutes > 0 && formatMinutes(day.target.minutes)}
				</td>
				<td data-numeric data-toggle onClick={toggle}>
					{counted &&
						(remaining > 0 ? (
							<span className={styles.remaining}>
								{t('row.remaining', { minutes: formatMinutes(remaining) })}
							</span>
						) : (
							formatMinutes(day.diffMinutes + extra, { signed: true })
						))}
				</td>
				<td data-priority="mid" data-toggle onClick={toggle}>
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
}, sameRow);

function Notices({ day }: { day: Day }) {
	const { t } = useTranslation(['week', 'hr']);
	const paragraphs = new Map<string, boolean>();
	for (const finding of day.findings) {
		const label = paragraph(finding.code);
		const open = finding.severity === 'warning' && !finding.ack;
		paragraphs.set(label, (paragraphs.get(label) ?? false) || open);
	}

	return (
		<span className={styles.tags}>
			{[...paragraphs].map(([label, open]) => (
				<span key={label} title={t(`hr:findings.states.${open ? 'open' : 'acknowledged'}`)}>
					<Tag tone={open ? 'error' : 'neutral'}>{label}</Tag>
					<VisuallyHidden>
						, {t(`hr:findings.states.${open ? 'open' : 'acknowledged'}`)}
					</VisuallyHidden>
				</span>
			))}
			{day.absence && <Tag>{t(`absence.${day.absence.type}`)}</Tag>}
			{day.holiday && <Tag>{t('detail.holiday')}</Tag>}
		</span>
	);
}
