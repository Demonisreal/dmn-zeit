import {
	aggregate,
	budgetStatus,
	isBillable,
	projectCoverage,
	roundDiv,
	roundingFor,
	timerHint,
	wholeMinutes,
	type Cell,
	type ProjectEntry as BilledEntry,
	type Rate as BillingRate,
	type RoundingOverride,
	type RoundingRule
} from '@zeit/rules';
import type {
	BudgetStatus,
	DayCoverage,
	ProjectEntry,
	ProjectSummary,
	ProjectTimer,
	ProjectWeek,
	ProjectWeekCell,
	ProjectWeekRow,
	Rate
} from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { TIME_ZONE } from '../time/day-engine';
import type { DateRange, EntryRow, Sheet } from '../time/time.store';

// the tenant rounding profile comes with the billing profile in 10d, until then minutes stay as booked
export const TENANT_ROUNDING: RoundingRule = { incrementMinutes: 1, mode: 'nearest' };

export const NO_OVERRIDE: RoundingOverride = { incrementMinutes: null, mode: null };

export type ProjectMeta = {
	id: string;
	name: string;
	clientId: string;
	clientName: string;
	billable: boolean;
	budgetMinutes: number | null;
	client: RoundingOverride;
	project: RoundingOverride;
};

export type TaskMeta = { id: string; projectId: string; name: string; billable: boolean | null };

export type Catalog = { projects: Map<string, ProjectMeta>; tasks: Map<string, TaskMeta> };

type Sums = { rawMinutes: number; roundedMinutes: number; amountCents: string | null };

const instantOf = (now: Date) => Temporal.Instant.fromEpochMilliseconds(now.getTime());

const spanOf = (entry: { startedAt: string; endedAt: string | null }) => ({
	start: Temporal.Instant.from(entry.startedAt),
	end: entry.endedAt === null ? null : Temporal.Instant.from(entry.endedAt)
});

export const mondayOf = (date: string): string => {
	const day = Temporal.PlainDate.from(date);
	return day.subtract({ days: day.dayOfWeek - 1 }).toString();
};

function datesOf(range: DateRange): string[] {
	const dates: string[] = [];
	const last = Temporal.PlainDate.from(range.to);
	for (let day = Temporal.PlainDate.from(range.from); Temporal.PlainDate.compare(day, last) <= 0;) {
		dates.push(day.toString());
		day = day.add({ days: 1 });
	}
	return dates;
}

export const weekOf = (monday: string): DateRange => ({
	from: monday,
	to: Temporal.PlainDate.from(monday).add({ days: 6 }).toString()
});

const ruleOf = (project: ProjectMeta) =>
	roundingFor(TENANT_ROUNDING, project.client, project.project).rule;

function toBillingRate(rate: Rate): BillingRate {
	return {
		id: rate.id,
		clientId: rate.clientId,
		projectId: rate.projectId,
		taskId: rate.taskId,
		employeeId: rate.employeeId,
		validFrom: Temporal.PlainDate.from(rate.validFrom),
		cents: BigInt(rate.rateCents)
	};
}

// a running entry counts up to now, the way summarizeWorkday closes it
function billed(
	rows: readonly ProjectEntry[],
	catalog: Catalog,
	now: Temporal.Instant
): BilledEntry[] {
	return rows.map((row) => {
		const project = catalog.projects.get(row.projectId)!;
		const task = row.taskId === null ? null : (catalog.tasks.get(row.taskId) ?? null);
		return {
			id: row.id,
			employeeId: row.employeeId,
			clientId: project.clientId,
			projectId: row.projectId,
			taskId: row.taskId,
			workday: Temporal.PlainDate.from(row.workday),
			billable: isBillable(row, task, project),
			start: Temporal.Instant.from(row.startedAt),
			end: row.endedAt === null ? now : Temporal.Instant.from(row.endedAt)
		};
	});
}

// the budget counts what the client pays for: rounded minutes of billable cells
export function budgetOf(
	project: ProjectMeta,
	rows: readonly ProjectEntry[],
	catalog: Catalog,
	now: Date
): BudgetStatus | null {
	if (project.budgetMinutes === null) return null;
	const cells = aggregate(billed(rows, catalog, instantOf(now)), {
		rates: [],
		rounding: () => ruleOf(project)
	});
	const usedMinutes = cells
		.filter((cell) => cell.billable)
		.reduce((total, cell) => total + cell.roundedMinutes, 0);
	const status = budgetStatus(usedMinutes, project.budgetMinutes);
	return {
		minutes: project.budgetMinutes,
		usedMinutes,
		state: status.state,
		explanation: status.explanation
	};
}

// app.project_budget_status sums finished entries only, the running one counts up to now
export function runningBudget(
	finished: { budgetMinutes: number; usedMinutes: number },
	running: ProjectEntry,
	billable: boolean,
	now: Date
): BudgetStatus {
	const since = Temporal.Instant.from(running.startedAt);
	const usedMinutes =
		finished.usedMinutes + (billable ? wholeMinutes([{ start: since, end: instantOf(now) }]) : 0);
	const status = budgetStatus(usedMinutes, finished.budgetMinutes);
	return {
		minutes: finished.budgetMinutes,
		usedMinutes,
		state: status.state,
		explanation: status.explanation
	};
}

export function timerOf(
	running: ProjectEntry | undefined,
	budget: BudgetStatus | null,
	now: Date
): ProjectTimer {
	if (!running) return { state: 'idle' };
	return {
		state: 'running',
		entryId: running.id,
		projectId: running.projectId,
		taskId: running.taskId,
		since: running.startedAt,
		hint: timerHint(Temporal.Instant.from(running.startedAt), instantOf(now)),
		budget
	};
}

function weekCell(cell: Cell, rows: Map<string, ProjectEntry>, priced: boolean): ProjectWeekCell {
	const booked = cell.entryIds.map((id) => rows.get(id)!);
	const rate = priced ? cell.rate : null;
	return {
		date: cell.date.toString(),
		rawMinutes: cell.rawMinutes,
		roundedMinutes: cell.roundedMinutes,
		amountCents:
			rate && cell.billable
				? String(roundDiv(BigInt(cell.roundedMinutes) * rate.cents, 60n))
				: null,
		billable: cell.billable,
		// 10d tells a draft from an issued invoice, until then any invoice locks the cell as draft
		lock: booked.some((entry) => entry.invoiceId !== null) ? 'draft' : 'none',
		derivation: {
			entries: booked.map(({ id, startedAt, endedAt }) => ({ id, startedAt, endedAt })),
			rounding: cell.rounding,
			rate: rate && { cents: String(rate.cents), explanation: rate.explanation }
		}
	};
}

function sumOf(cells: readonly ProjectWeekCell[], priced: boolean): Sums {
	let cents = 0n;
	let rawMinutes = 0;
	let roundedMinutes = 0;
	for (const cell of cells) {
		rawMinutes += cell.rawMinutes;
		roundedMinutes += cell.roundedMinutes;
		if (cell.amountCents !== null) cents += BigInt(cell.amountCents);
	}
	return { rawMinutes, roundedMinutes, amountCents: priced ? String(cents) : null };
}

export type WeekInput = {
	monday: string;
	rows: readonly ProjectEntry[];
	catalog: Catalog;
	// null for readers below hr: no rate is looked at and no amount leaves this function
	rates: readonly Rate[] | null;
	now: Date;
};

export function projectWeek(input: WeekInput): Omit<ProjectWeek, 'coverage'> {
	const { monday, rows, catalog, rates, now } = input;
	const priced = rates !== null;
	const cells = aggregate(billed(rows, catalog, instantOf(now)), {
		rates: priced ? rates.map(toBillingRate) : [],
		rounding: (projectId) => ruleOf(catalog.projects.get(projectId)!)
	});
	const byId = new Map(rows.map((row) => [row.id, row]));
	const pairs = cells.map((cell) => ({ cell, week: weekCell(cell, byId, priced) }));

	const grouped = new Map<string, ProjectWeekRow>();
	for (const { cell, week } of pairs) {
		const key = `${cell.projectId}|${cell.taskId ?? ''}`;
		const row = grouped.get(key);
		if (row) {
			row.cells.push(week);
			continue;
		}
		const project = catalog.projects.get(cell.projectId)!;
		grouped.set(key, {
			project: { id: project.id, name: project.name, clientName: project.clientName },
			task:
				cell.taskId === null
					? null
					: { id: cell.taskId, name: catalog.tasks.get(cell.taskId)?.name ?? '' },
			cells: [week],
			rowTotal: { rawMinutes: 0, roundedMinutes: 0, amountCents: null }
		});
	}
	const weekRows = [...grouped.values()]
		.map((row) => ({
			...row,
			// billable and non-billable time of one day are two cells, the sort keeps them together
			cells: row.cells.toSorted(
				(a, b) => a.date.localeCompare(b.date) || Number(b.billable) - Number(a.billable)
			),
			rowTotal: sumOf(row.cells, priced)
		}))
		.sort(
			(a, b) =>
				a.project.clientName.localeCompare(b.project.clientName) ||
				a.project.name.localeCompare(b.project.name) ||
				(a.task?.name ?? '').localeCompare(b.task?.name ?? '')
		);

	const all = pairs.map(({ week }) => week);
	const unbilled = new Map<
		string,
		{ clientId: string; clientName: string; minutes: number; cents: bigint }
	>();
	if (priced) {
		for (const { cell, week } of pairs) {
			if (!cell.billable || week.lock !== 'none') continue;
			const project = catalog.projects.get(cell.projectId)!;
			const open = unbilled.get(project.clientId) ?? {
				clientId: project.clientId,
				clientName: project.clientName,
				minutes: 0,
				cents: 0n
			};
			open.minutes += week.roundedMinutes;
			if (week.amountCents !== null) open.cents += BigInt(week.amountCents);
			unbilled.set(project.clientId, open);
		}
	}

	return {
		from: monday,
		rows: weekRows,
		dayTotals: datesOf(weekOf(monday)).map((date) => ({
			date,
			...sumOf(
				all.filter((cell) => cell.date === date),
				priced
			)
		})),
		weekTotal: sumOf(all, priced),
		unbilled: [...unbilled.values()]
			.sort((a, b) => a.clientName.localeCompare(b.clientName))
			.map(({ cents, ...open }) => ({ ...open, amountCents: String(cents) }))
	};
}

function coverageOn(
	date: string,
	rows: readonly ProjectEntry[],
	work: readonly EntryRow[],
	now: Temporal.Instant
): DayCoverage {
	const onDate = <T extends { workday: string }>(list: readonly T[]) =>
		list.filter((entry) => entry.workday === date);
	const coverage = projectCoverage(onDate(rows).map(spanOf), onDate(work).map(spanOf), {
		now,
		timeZone: TIME_ZONE
	});
	return {
		date,
		projectMinutes: coverage.projectMinutes,
		workedMinutes: coverage.workedMinutes,
		coveredMinutes: coverage.coveredMinutes,
		outsideMinutes: coverage.outsideMinutes,
		unassignedMinutes: coverage.unassignedMinutes,
		hints: [...coverage.hints]
	};
}

export function weekCoverage(
	monday: string,
	rows: readonly ProjectEntry[],
	work: readonly EntryRow[],
	now: Date
): DayCoverage[] {
	const at = instantOf(now);
	return datesOf(weekOf(monday)).map((date) => coverageOn(date, rows, work, at));
}

export type SummaryInput = {
	range: DateRange;
	rows: readonly ProjectEntry[];
	sheets: Map<string, Sheet>;
	projectNames: Map<string, string>;
	now: Date;
};

export function projectSummary(input: SummaryInput): ProjectSummary {
	const { range, rows, sheets, projectNames, now } = input;
	const at = instantOf(now);
	const dates = datesOf(range);
	const summary: ProjectSummary = [];

	for (const sheet of sheets.values()) {
		const own = rows.filter((row) => row.employeeId === sheet.employee.id);
		if (own.length === 0) continue;
		const coverage = dates
			.map((date) => coverageOn(date, own, sheet.entries, at))
			.filter((day) => day.projectMinutes > 0 || day.workedMinutes > 0);

		for (const projectId of new Set(own.map((row) => row.projectId))) {
			const spans = own
				.filter((row) => row.projectId === projectId)
				.map((row) => ({
					start: Temporal.Instant.from(row.startedAt),
					end: row.endedAt === null ? at : Temporal.Instant.from(row.endedAt)
				}));
			summary.push({
				employeeId: sheet.employee.id,
				employeeName: sheet.employee.name,
				projectId,
				projectName: projectNames.get(projectId) ?? '',
				minutes: wholeMinutes(spans),
				coverage
			});
		}
	}
	return summary.sort(
		(a, b) =>
			a.employeeName.localeCompare(b.employeeName) || a.projectName.localeCompare(b.projectName)
	);
}
