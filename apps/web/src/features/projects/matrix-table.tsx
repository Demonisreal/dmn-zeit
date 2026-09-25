import type { DayCoverage, ProjectWeek } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chevron } from '../../components/ui/chevron';
import { Table } from '../../components/ui/table';
import { formatCents, formatMinutes } from '../../i18n/format';
import { todayIso } from '../../lib/dates';
import { addDays, shortDate, weekdayShort } from '../week/dates';
import { CoverageRows } from './coverage-row';
import { groupRows } from './matrix-rows';
import { ProjectRows } from './matrix-row';
import styles from './matrix-table.module.css';

type Props = {
	label: string;
	week: ProjectWeek;
	employeeId: string;
	// own entries can be added, changed and struck from the detail
	own: boolean;
	// the team view leaves money out even for hr, who would get it from the api
	amounts: boolean;
	coverage: DayCoverage[] | null;
	empty: string;
	isStale?: boolean;
};

const flip = (set: Set<string>, key: string) => {
	const next = new Set(set);
	if (next.has(key)) next.delete(key);
	else next.add(key);
	return next;
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
	// a handful of projects reads fine at once, a long list folds by client
	const foldable = clients.reduce((sum, client) => sum + client.projects.length, 0) > 5;
	const withAmount = amounts && week.weekTotal.amountCents !== null;
	const columns = days.length + (withAmount ? 3 : 2);
	const [open, setOpen] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(() => new Set<string>());
	const [folded, setFolded] = useState(() => new Set<string>());
	const priority = (date: string) => (date === today ? undefined : 'mid');

	return (
		<div
			className={styles.frame}
			aria-busy={isStale || undefined}
			data-stale={isStale || undefined}
		>
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
											today={today}
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
						{days.map((date) => {
							const minutes = week.dayTotals.find((day) => day.date === date)?.roundedMinutes ?? 0;
							return (
								<td key={date} data-numeric data-priority={priority(date)}>
									{minutes > 0 && formatMinutes(minutes)}
								</td>
							);
						})}
						<td data-numeric>{formatMinutes(week.weekTotal.roundedMinutes)}</td>
						{withAmount && (
							<td data-numeric data-priority="wide">
								{formatCents(week.weekTotal.amountCents ?? '0', lng)}
							</td>
						)}
					</tr>
					{coverage && (
						<CoverageRows coverage={coverage} days={days} today={today} withAmount={withAmount} />
					)}
				</tfoot>
			</Table>
		</div>
	);
}
