import type { ProjectWeekCell } from '@zeit/shared';
import { Fragment } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Chevron } from '../../components/ui/chevron';
import { formatCents, formatMinutes } from '../../i18n/format';
import { CellDetail } from './cell-detail';
import type { Line, ProjectGroup } from './matrix-rows';
import styles from './matrix-table.module.css';
import { RowDetail } from './row-detail';

type Props = {
	group: ProjectGroup;
	days: string[];
	day: string;
	columns: number;
	withAmount: boolean;
	employeeId: string;
	own: boolean;
	open: string | null;
	onOpen: (key: string) => void;
	expanded: boolean;
	onExpand: () => void;
};

export function ProjectRows({
	group,
	days,
	day,
	columns,
	withAmount,
	employeeId,
	own,
	open,
	onOpen,
	expanded,
	onExpand
}: Props) {
	const { t, i18n } = useTranslation('projects');
	const lng = i18n.language;
	const priority = (date: string) => (date === day ? undefined : 'mid');
	const blank = (
		<span className={styles.blank} aria-hidden="true">
			–
		</span>
	);
	const amount = (cents: string | null, billable: boolean) =>
		billable ? (
			cents !== null && formatCents(cents, lng)
		) : (
			<span className={styles.unbilled} title={t('detail.notBillable')}>
				–<VisuallyHidden elementType="span">{t('detail.notBillable')}</VisuallyHidden>
			</span>
		);
	const detailId = (key: string) => `matrix-${key}`;

	const cellButton = (line: Line, target: string, minutes: number, cell?: ProjectWeekCell) => {
		const key = `${line.key}|${target}`;
		const isOpen = open === key;
		const running = cell?.derivation.entries.some((entry) => entry.endedAt === null);
		return (
			<button
				type="button"
				className={styles.cell}
				aria-expanded={isOpen}
				aria-controls={isOpen ? detailId(line.key) : undefined}
				data-lock={cell && cell.lock !== 'none' ? cell.lock : undefined}
				data-running={running || undefined}
				onClick={() => onOpen(key)}
			>
				{formatMinutes(minutes)}
				<VisuallyHidden elementType="span">
					{running && `, ${t('cell.running')}`}
					{cell && cell.lock !== 'none' && `, ${t(`cell.lock.${cell.lock}`)}`}, {t('cell.toggle')}
				</VisuallyHidden>
			</button>
		);
	};

	const lineCells = (line: Line) => (
		<>
			{days.map((date) => {
				const cell = line.cells.get(date);
				return (
					<td key={date} data-numeric data-priority={priority(date)}>
						{cell ? cellButton(line, date, cell.roundedMinutes, cell) : blank}
					</td>
				);
			})}
			<td data-numeric>{cellButton(line, 'week', line.row.rowTotal.roundedMinutes)}</td>
			{withAmount && (
				<td data-numeric data-priority="wide">
					{amount(line.row.rowTotal.amountCents, line.billable)}
				</td>
			)}
		</>
	);

	const detail = (line: Line) => {
		if (!open?.startsWith(`${line.key}|`)) return null;
		const target = open.slice(line.key.length + 1);
		const cell = line.cells.get(target);
		if (target !== 'week' && !cell) return null;
		return (
			<tr className={styles.detailRow}>
				<td id={detailId(line.key)} colSpan={columns}>
					{cell ? (
						<CellDetail
							key={target}
							cell={cell}
							row={line.row}
							employeeId={employeeId}
							own={own}
							withAmount={withAmount}
						/>
					) : (
						<RowDetail
							line={line}
							days={days}
							withAmount={withAmount}
							onDay={(date) => onOpen(`${line.key}|${date}`)}
						/>
					)}
				</td>
			</tr>
		);
	};

	if (group.single) {
		const line = group.lines[0]!;
		return (
			<>
				<tr className={styles.row}>
					<th scope="row" className={styles.name}>
						{group.name}
					</th>
					{lineCells(line)}
				</tr>
				{detail(line)}
			</>
		);
	}

	return (
		<>
			<tr className={styles.row}>
				<th scope="row" className={styles.name}>
					<button
						type="button"
						className={styles.toggle}
						aria-expanded={expanded}
						onClick={onExpand}
					>
						<Chevron direction={expanded ? 'down' : 'right'} />
						<span>{group.name}</span>
						<VisuallyHidden elementType="span">
							, {t('row.tasks', { count: group.lines.length })}
						</VisuallyHidden>
					</button>
				</th>
				{days.map((date) => (
					<td key={date} data-numeric data-priority={priority(date)}>
						{group.days.has(date) ? formatMinutes(group.days.get(date)!) : blank}
					</td>
				))}
				<td data-numeric>{formatMinutes(group.total)}</td>
				{withAmount && (
					<td data-numeric data-priority="wide">
						{amount(
							group.amountCents,
							group.lines.some((line) => line.billable)
						)}
					</td>
				)}
			</tr>
			{expanded &&
				group.lines.map((line) => (
					<Fragment key={line.key}>
						<tr className={`${styles.row} ${styles.task}`}>
							<th scope="row" className={styles.name}>
								{line.row.task?.name ?? t('noTask')}
							</th>
							{lineCells(line)}
						</tr>
						{detail(line)}
					</Fragment>
				))}
		</>
	);
}
