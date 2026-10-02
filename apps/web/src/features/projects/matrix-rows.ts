import type { ProjectWeek, ProjectWeekCell, ProjectWeekRow } from '@zeit/shared';

export type Line = {
	key: string;
	row: ProjectWeekRow;
	cells: Map<string, ProjectWeekCell>;
	billable: boolean;
};

export type ProjectGroup = {
	id: string;
	name: string;
	lines: Line[];
	single: boolean;
	days: Map<string, number>;
	total: number;
	amountCents: string | null;
};

export type ClientGroup = {
	name: string;
	projects: ProjectGroup[];
};

export const lineKey = (row: ProjectWeekRow) => `${row.project.id}-${row.task?.id ?? 'none'}`;

export function sumCents(amounts: (string | null)[]) {
	const known = amounts.filter((cents): cents is string => cents !== null);
	return known.length === 0 ? null : String(known.reduce((sum, cents) => sum + Number(cents), 0));
}

export function groupRows(week: ProjectWeek, lng: string): ClientGroup[] {
	const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, lng);
	const clients = new Map<string, Map<string, Line[]>>();
	for (const row of week.rows) {
		const projects = clients.get(row.project.clientName) ?? new Map<string, Line[]>();
		const line = {
			key: lineKey(row),
			row,
			cells: new Map(row.cells.map((cell) => [cell.date, cell])),
			billable: row.cells.some((cell) => cell.billable)
		};
		projects.set(row.project.id, [...(projects.get(row.project.id) ?? []), line]);
		clients.set(row.project.clientName, projects);
	}

	return [...clients]
		.map(([name, projects]) => ({
			name,
			projects: [...projects.values()]
				.map((lines): ProjectGroup => {
					const sorted = lines.toSorted((a, b) =>
						a.row.task === null ? -1 : b.row.task === null ? 1 : byName(a.row.task, b.row.task)
					);
					const days = new Map<string, number>();
					for (const cell of lines.flatMap((line) => line.row.cells)) {
						days.set(cell.date, (days.get(cell.date) ?? 0) + cell.roundedMinutes);
					}
					return {
						id: lines[0]!.row.project.id,
						name: lines[0]!.row.project.name,
						lines: sorted,
						single: lines.length === 1 && lines[0]!.row.task === null,
						days,
						total: lines.reduce((sum, line) => sum + line.row.rowTotal.roundedMinutes, 0),
						amountCents: sumCents(lines.map((line) => line.row.rowTotal.amountCents))
					};
				})
				.toSorted(byName)
		}))
		.toSorted(byName);
}
