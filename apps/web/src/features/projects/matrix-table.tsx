import type { DayCoverage, ProjectWeek } from '@zeit/shared';
import { useState } from 'react';
import { Radio, RadioGroup, VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Chevron } from '../../components/ui/chevron';
import { Table } from '../../components/ui/table';
import { formatCents, formatDate, formatMinutes } from '../../i18n/format';
import { todayIso } from '../../lib/dates';
import { flip } from '../../lib/sets';
import { addDays, shortDate, weekdayShort } from '../week/dates';
import { CoverageRows } from './coverage-row';
import { groupRows } from './matrix-rows';
import { ProjectRows } from './matrix-row';
import styles from './matrix-table.module.css';

const segments = styles as Record<'days' | 'day', string>;

const lockKinds = ['draft', 'issued'] as const;

type Props = {
	label: string;
	week: ProjectWeek;
	employeeId: string;
	own: boolean;
	amounts: boolean;
	coverage: DayCoverage[] | null;
	empty: string;
	isStale?: boolean;
};

export function MatrixTable({
	label,
	week,
	employeeId,
	own,
	amounts,
	coverage,
	empty,
	isStale = false
}: Props) {
	const { t, i18n } = useTranslation(['projects', 'week']);
	const lng = i18n.language;
	const today = todayIso();
	const days = Array.from({ length: 7 }, (_, i) => addDays(week.from, i));
	const clients = groupRows(week, lng);
	const foldable = clients.reduce((sum, client) => sum + client.projects.length, 0) > 5;
	const withAmount = amounts && week.weekTotal.amountCents !== null;
	const columns = days.length + (withAmount ? 3 : 2);
	const [open, setOpen] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(() => new Set<string>());
	const [folded, setFolded] = useState(() => new Set<string>());
	const [weekday, setWeekday] = useState<number | null>(null);
	const day = weekday !== null ? days[weekday]! : days.includes(today) ? today : days[0]!;
	const priority = (date: string) => (date === day ? undefined : 'mid');
	const dayMinutes = (date: string) =>
		week.dayTotals.find((total) => total.date === date)?.roundedMinutes ?? 0;
	const locks = lockKinds.filter((kind) =>
		week.rows.some((row) => row.cells.some((cell) => cell.lock === kind))
	);

	return (
		<div
			className={styles.frame}
			aria-busy={isStale || undefined}
			data-stale={isStale || undefined}
		>
			<RadioGroup
				aria-label={t('matrix.day')}
				orientation="horizontal"
				value={day}
				onChange={(date) => setWeekday(days.indexOf(date))}
				className={segments.days}
			>
				{days.map((date) => (
					<Radio
						key={date}
						value={date}
						className={segments.day}
						data-today={date === today || undefined}
					>
						<span aria-hidden="true">{weekdayShort(date, lng)}</span>
						<VisuallyHidden>
							{formatDate(date, lng, {
								weekday: 'long',
								day: 'numeric',
								month: 'long',
								year: undefined
							})}
						</VisuallyHidden>
						<span className={styles.dayMinutes}>
							{dayMinutes(date) > 0 ? (
								formatMinutes(dayMinutes(date))
							) : (
								<span aria-hidden="true">–</span>
							)}
						</span>
					</Radio>
				))}
			</RadioGroup>
			<Table label={label}>
				<thead>
					<tr>
						<th scope="col">{t('col.project')}</th>
						{days.map((date) => (
							<th
								key={date}
								scope="col"
								data-numeric
								data-priority={priority(date)}
								data-today={date === today || undefined}
								className={styles.fixed}
								aria-current={date === today ? 'date' : undefined}
							>
								<span className={styles.dayName}>{weekdayShort(date, lng)}</span>
								<span className={styles.dayDate}>{shortDate(date, lng)}</span>
							</th>
						))}
						<th scope="col" data-numeric className={styles.fixed}>
							{t('col.total')}
						</th>
						{withAmount && (
							<th scope="col" data-numeric data-priority="wide" className={styles.fixed}>
								{t('col.amount')}
							</th>
						)}
					</tr>
				</thead>
				{clients.length === 0 ? (
					<tbody>
						<tr>
							<td colSpan={columns} className={styles.empty}>
								{empty}
							</td>
						</tr>
					</tbody>
				) : (
					clients.map((client) => {
						const closed = folded.has(client.name);
						return (
							<tbody key={client.name}>
								<tr className={styles.client}>
									<th scope="rowgroup" colSpan={columns}>
										{foldable ? (
											<button
												type="button"
												className={styles.toggle}
												aria-expanded={!closed}
												onClick={() => setFolded(flip(folded, client.name))}
											>
												<Chevron direction={closed ? 'right' : 'down'} />
												{client.name}
											</button>
										) : (
											client.name
										)}
									</th>
								</tr>
								{!closed &&
									client.projects.map((group) => (
										<ProjectRows
											key={group.id}
											group={group}
											days={days}
											day={day}
											columns={columns}
											withAmount={withAmount}
											employeeId={employeeId}
											own={own}
											open={open}
											onOpen={(key) => setOpen(open === key ? null : key)}
											expanded={expanded.has(group.id)}
											onExpand={() => setExpanded(flip(expanded, group.id))}
										/>
									))}
							</tbody>
						);
					})
				)}
				<tfoot>
					<tr>
						<th scope="row" className={styles.sumLabel}>
							{t('week:total')}
						</th>
						{days.map((date) => (
							<td key={date} data-numeric data-priority={priority(date)}>
								{dayMinutes(date) > 0 ? (
									formatMinutes(dayMinutes(date))
								) : (
									<span className={styles.blank} aria-hidden="true">
										–
									</span>
								)}
							</td>
						))}
						<td data-numeric>{formatMinutes(week.weekTotal.roundedMinutes)}</td>
						{withAmount && (
							<td data-numeric data-priority="wide">
								{formatCents(week.weekTotal.amountCents ?? '0', lng)}
							</td>
						)}
					</tr>
					{coverage && (
						<CoverageRows
							coverage={coverage}
							days={days}
							day={day}
							today={today}
							withAmount={withAmount}
						/>
					)}
				</tfoot>
			</Table>
			{locks.length > 0 && (
				<p className={styles.locks}>
					{t('cell.locked')}
					{locks.map((kind) => (
						<span key={kind} className={styles.lockKey}>
							<span className={styles.swatch} data-lock={kind} aria-hidden="true" />
							{t(`cell.lock.${kind}`)}
						</span>
					))}
				</p>
			)}
		</div>
	);
}
