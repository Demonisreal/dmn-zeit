import type { DayRange } from '@zeit/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Chevron } from '../../components/ui/chevron';
import { Table } from '../../components/ui/table';
import { formatMinutes } from '../../i18n/format';
import { todayIso } from '../../lib/dates';
import { DayDetail, type FindingAction } from './day-detail';
import { DayRow } from './day-row';
import styles from './day-table.module.css';
import { minutesSince, useNow } from './use-now';

type Props = {
	label: string;
	range: DayRange;
	fetchedAt: number;
	totalLabel: string;
	balance?: ReactNode;
	balanceDetail?: ReactNode;
	own: boolean;
	openDay?: string | undefined;
	findingAction?: FindingAction | undefined;
	isStale?: boolean;
	isDemo?: boolean;
};

export function DayTable({
	label,
	range,
	fetchedAt,
	totalLabel,
	balance,
	balanceDetail,
	own,
	openDay,
	findingAction,
	isStale = false,
	isDemo = false
}: Props) {
	const { t } = useTranslation('week');
	const frame = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(() => new Set(openDay ? [openDay] : []));
	const [flexOpen, setFlexOpen] = useState(false);
	const today = todayIso();
	// placeholder data from the previous period has no fetchedAt yet, extra would run into millions of minutes
	const running = !isStale && range.days.some((day) => day.running);
	const now = useNow(running);
	const extra = running ? minutesSince(fetchedAt, now) : 0;
	const explained = Boolean(balanceDetail);
	const { totals } = range;

	// a link from the findings opens its day, which may sit far down the month
	useEffect(() => {
		if (!openDay) return;
		frame.current?.querySelector<HTMLElement>(`[aria-controls="day-${openDay}"]`)?.focus();
	}, [openDay]);

	// stable, so the memoized rows that stay closed can skip the render
	const toggle = useCallback(
		(date: string) =>
			setOpen((prev) => {
				const next = new Set(prev);
				if (next.has(date)) next.delete(date);
				else next.add(date);
				return next;
			}),
		[]
	);
	const toggleFlex = () => setFlexOpen(!flexOpen);

	return (
		<div
			ref={frame}
			className={styles.frame}
			aria-busy={isStale || undefined}
			data-stale={isStale || undefined}
		>
			<Table label={label}>
				<thead>
					<tr>
						<th scope="col">{t('col.day')}</th>
						<th scope="col" className={styles.barCol}>
							<span className={styles.scale} aria-hidden="true">
								<span>6</span>
								<span>12</span>
								<span>18</span>
								<span>22</span>
							</span>
							<VisuallyHidden>{t('col.bar')}</VisuallyHidden>
						</th>
						<th scope="col" data-numeric data-priority="wide">
							{t('col.in')}
						</th>
						<th scope="col" data-numeric data-priority="wide">
							{t('col.out')}
						</th>
						<th scope="col" data-numeric data-priority="wide">
							{t('col.break')}
						</th>
						<th scope="col" data-numeric>
							{t('col.worked')}
						</th>
						<th scope="col" data-numeric data-priority="mid">
							{t('col.target')}
						</th>
						<th scope="col" data-numeric>
							{t('col.diff')}
						</th>
						<th scope="col" data-priority="mid">
							{t('col.notice')}
						</th>
					</tr>
				</thead>
				<tbody>
					{range.days.map((day) => {
						const dayExtra = day.running ? extra : 0;
						// only the running day draws up to now, the others keep a fixed value and skip the tick
						const dayNow = day.running ? now : fetchedAt;
						return (
							<DayRow
								key={day.date}
								day={day}
								extra={dayExtra}
								now={dayNow}
								isToday={day.date === today}
								isFuture={day.date > today}
								isOpen={open.has(day.date)}
								onToggle={toggle}
							>
								<DayDetail
									day={day}
									employeeId={range.employeeId}
									extra={dayExtra}
									now={dayNow}
									isToday={day.date === today}
									isFuture={day.date > today}
									own={own}
									findingAction={findingAction}
									isDemo={isDemo}
								/>
							</DayRow>
						);
					})}
				</tbody>
				<tfoot>
					<tr>
						<th scope="row" className={styles.sumLabel}>
							{totalLabel}
						</th>
						<td className={styles.barCol} />
						<td data-priority="wide" />
						<td data-priority="wide" />
						<td data-priority="wide" />
						<td data-numeric>{formatMinutes(totals.workedMinutes + extra)}</td>
						<td data-numeric data-priority="mid">
							{formatMinutes(totals.targetMinutes)}
						</td>
						<td data-numeric>
							{formatMinutes(totals.diffMinutes + extra, { signed: true })}
							{range.from <= today && today < range.to && (
								<span className={styles.note}>{t(running ? 'untilNow' : 'untilToday')}</span>
							)}
						</td>
						<td data-priority="mid" />
					</tr>
					{balance && (
						<tr className={styles.row}>
							<th scope="row" colSpan={2} className={styles.sumLabel}>
								{explained ? (
									<button
										type="button"
										className={styles.toggle}
										aria-expanded={flexOpen}
										aria-controls={flexOpen ? 'flex-detail' : undefined}
										onClick={toggleFlex}
									>
										<Chevron direction={flexOpen ? 'down' : 'right'} />
										{t('flex')}
									</button>
								) : (
									t('flex')
								)}
							</th>
							<td data-priority="wide" />
							<td data-priority="wide" />
							<td data-priority="wide" />
							<td />
							<td data-priority="mid" />
							<td
								data-numeric
								data-toggle={explained || undefined}
								onClick={explained ? toggleFlex : undefined}
							>
								{balance}
							</td>
							<td data-priority="mid" />
						</tr>
					)}
				</tfoot>
			</Table>
			{flexOpen && explained && (
				<div id="flex-detail" className={styles.flexDetail}>
					{balanceDetail}
				</div>
			)}
		</div>
	);
}
