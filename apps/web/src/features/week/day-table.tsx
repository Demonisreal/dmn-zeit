import type { DayRange } from '@zeit/shared';
import { useState, type ReactNode } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Table } from '../../components/ui/table';
import { formatMinutes } from '../../i18n/format';
import { todayIso } from './dates';
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
	canCorrect: boolean;
	findingAction?: FindingAction | undefined;
	isStale?: boolean;
};

export function DayTable({
	label,
	range,
	fetchedAt,
	totalLabel,
	balance,
	canCorrect,
	findingAction,
	isStale = false
}: Props) {
	const { t } = useTranslation('week');
	const now = useNow();
	const [open, setOpen] = useState<string | null>(null);
	const today = todayIso();
	// placeholder data from the previous period has no fetchedAt yet, extra would run into millions of minutes
	const extra =
		!isStale && range.days.some((day) => day.running) ? minutesSince(fetchedAt, now) : 0;
	const { totals } = range;

	return (
		<div
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
						<th scope="col" data-numeric className={styles.wide}>
							{t('col.in')}
						</th>
						<th scope="col" data-numeric className={styles.wide}>
							{t('col.out')}
						</th>
						<th scope="col" data-numeric className={styles.wide}>
							{t('col.break')}
						</th>
						<th scope="col" data-numeric>
							{t('col.worked')}
						</th>
						<th scope="col" data-numeric className={styles.mid}>
							{t('col.target')}
						</th>
						<th scope="col" data-numeric>
							{t('col.diff')}
						</th>
						<th scope="col" className={styles.mid}>
							{t('col.notice')}
						</th>
					</tr>
				</thead>
				<tbody>
					{range.days.map((day) => {
						const isOpen = open === day.date;
						const dayExtra = day.running ? extra : 0;
						return (
							<DayRow
								key={day.date}
								day={day}
								extra={dayExtra}
								now={now}
								isToday={day.date === today}
								isFuture={day.date > today}
								isOpen={isOpen}
								onToggle={() => setOpen(isOpen ? null : day.date)}
							>
								<DayDetail
									day={day}
									employeeId={range.employeeId}
									extra={dayExtra}
									now={now}
									isFuture={day.date > today}
									canCorrect={canCorrect}
									findingAction={findingAction}
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
						<td className={styles.wide} />
						<td className={styles.wide} />
						<td className={styles.wide} />
						<td data-numeric>{formatMinutes(totals.workedMinutes + extra)}</td>
						<td data-numeric className={styles.mid}>
							{formatMinutes(totals.targetMinutes)}
						</td>
						<td data-numeric>
							{formatMinutes(totals.diffMinutes + extra, { signed: true })}
							{range.from <= today && today < range.to && (
								<span className={styles.note}>{t('untilToday')}</span>
							)}
						</td>
						<td className={styles.mid} />
					</tr>
					{balance && (
						<tr>
							<th scope="row" className={styles.sumLabel}>
								{t('flex')}
							</th>
							<td className={styles.barCol} />
							<td className={styles.wide} />
							<td className={styles.wide} />
							<td className={styles.wide} />
							<td />
							<td className={styles.mid} />
							<td data-numeric>{balance}</td>
							<td className={styles.mid} />
						</tr>
					)}
				</tfoot>
			</Table>
		</div>
	);
}
