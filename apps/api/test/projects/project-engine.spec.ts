import { aggregate, budgetStatus, resolveRate, roundingFor } from '@zeit/rules';
import type { ProjectEntry, Rate } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
	budgetOf,
	mondayOf,
	NO_OVERRIDE,
	projectSummary,
	projectWeek,
	runningBudget,
	TENANT_ROUNDING,
	timerOf,
	weekCoverage,
	type Catalog
} from '../../src/projects/project-engine';
import type { EntryRow, Sheet } from '../../src/time/time.store';

const employee = '00000000-0000-4000-8000-0000000000e1';
const client = '00000000-0000-4000-8000-0000000000c1';
const project = '00000000-0000-4000-8000-0000000000a1';
const task = '00000000-0000-4000-8000-0000000000b1';

const catalog: Catalog = {
	projects: new Map([
		[
			project,
			{
				id: project,
				name: 'Website',
				clientId: client,
				clientName: 'Bäckerei Korn',
				billable: true,
				budgetMinutes: 600,
				client: { incrementMinutes: 5, mode: 'up' },
				project: { incrementMinutes: 15, mode: null }
			}
		]
	]),
	tasks: new Map([[task, { id: task, projectId: project, name: 'Startseite', billable: null }]])
};

const rates: Rate[] = [
	{
		id: '00000000-0000-4000-8000-0000000000f1',
		clientId: client,
		projectId: null,
		taskId: null,
		employeeId: null,
		validFrom: '2026-01-01',
		rateCents: '9000',
		createdBy: null
	}
];

let lastId = 0;
function entry(startedAt: string, endedAt: string | null, parts: Partial<ProjectEntry> = {}) {
	return {
		id: `00000000-0000-4000-8000-${String(++lastId).padStart(12, '0')}`,
		employeeId: employee,
		projectId: project,
		taskId: task,
		startedAt,
		endedAt,
		workday: startedAt.slice(0, 10),
		note: 'Startseite',
		billable: null,
		source: 'manual',
		invoiceId: null,
		voidedAt: null,
		...parts
	} satisfies ProjectEntry;
}

const evening = new Date('2026-09-25T20:00:00+02:00');

// 47 + 20 minutes on monday: one cell of 67, rounded to 75 by the project's quarter hour
const monday = [
	entry('2026-09-21T09:00:00+02:00', '2026-09-21T09:47:00+02:00'),
	entry('2026-09-21T13:00:00+02:00', '2026-09-21T13:20:00+02:00')
];

describe('projectWeek', () => {
	it('takes minutes, rounding and rate straight from the rules', () => {
		const week = projectWeek({ monday: '2026-09-21', rows: monday, catalog, rates, now: evening });

		const meta = catalog.projects.get(project)!;
		const rule = roundingFor(TENANT_ROUNDING, meta.client, meta.project).rule;
		const [expected] = aggregate(
			monday.map((row) => ({
				id: row.id,
				employeeId: employee,
				clientId: client,
				projectId: project,
				taskId: task,
				workday: Temporal.PlainDate.from(row.workday),
				billable: true,
				start: Temporal.Instant.from(row.startedAt),
				end: Temporal.Instant.from(row.endedAt!)
			})),
			{
				rates: [{ ...rates[0]!, validFrom: Temporal.PlainDate.from('2026-01-01'), cents: 9000n }],
				rounding: () => rule
			}
		);
		const rate = resolveRate(
			[{ ...rates[0]!, validFrom: Temporal.PlainDate.from('2026-01-01'), cents: 9000n }],
			{
				clientId: client,
				projectId: project,
				taskId: task,
				employeeId: employee,
				date: Temporal.PlainDate.from('2026-09-21')
			}
		);

		// increment from the project, mode from the client
		expect(rule).toEqual({ incrementMinutes: 15, mode: 'up' });
		expect(week.rows).toHaveLength(1);
		const [cell] = week.rows[0]!.cells;
		expect(cell).toMatchObject({
			date: '2026-09-21',
			rawMinutes: expected!.rawMinutes,
			roundedMinutes: expected!.roundedMinutes,
			billable: true,
			lock: 'none',
			amountCents: '11250'
		});
		expect(cell!.rawMinutes).toBe(67);
		expect(cell!.roundedMinutes).toBe(75);
		expect(cell!.derivation.rounding).toEqual(expected!.rounding);
		expect(cell!.derivation.rate).toEqual({ cents: '9000', explanation: rate!.explanation });
		expect(week.rows[0]!.task).toEqual({ id: task, name: 'Startseite' });
		expect(week.weekTotal).toEqual({ rawMinutes: 67, roundedMinutes: 75, amountCents: '11250' });
		expect(week.dayTotals).toHaveLength(7);
		expect(week.dayTotals[1]).toEqual({
			date: '2026-09-22',
			rawMinutes: 0,
			roundedMinutes: 0,
			amountCents: '0'
		});
		expect(week.unbilled).toEqual([
			{ clientId: client, clientName: 'Bäckerei Korn', minutes: 75, amountCents: '11250' }
		]);
	});

	it('gives leads and employees no amount anywhere, whatever the entries look like', () => {
		const week = projectWeek({
			monday: '2026-09-21',
			rows: monday,
			catalog,
			rates: null,
			now: evening
		});

		const amounts = [
			...week.rows.flatMap((row) => [row.rowTotal, ...row.cells]),
			...week.dayTotals,
			week.weekTotal
		].map((sums) => sums.amountCents);
		expect(amounts.every((cents) => cents === null)).toBe(true);
		expect(week.rows[0]!.cells[0]!.derivation.rate).toBeNull();
		expect(week.unbilled).toEqual([]);
		expect(JSON.stringify(week)).not.toContain('9000');
		// the minutes stay the same, only the money is missing
		expect(week.weekTotal).toMatchObject({ rawMinutes: 67, roundedMinutes: 75 });
	});

	it('keeps non-billable and invoiced time out of the open amounts', () => {
		const rows = [
			...monday,
			entry('2026-09-22T09:00:00+02:00', '2026-09-22T10:00:00+02:00', { billable: false }),
			entry('2026-09-23T09:00:00+02:00', '2026-09-23T10:00:00+02:00', {
				invoiceId: '00000000-0000-4000-8000-0000000000d1'
			})
		];
		const week = projectWeek({ monday: '2026-09-21', rows, catalog, rates, now: evening });
		const cells = week.rows[0]!.cells;

		expect(cells.map((cell) => [cell.date, cell.billable, cell.lock, cell.amountCents])).toEqual([
			['2026-09-21', true, 'none', '11250'],
			['2026-09-22', false, 'none', null],
			['2026-09-23', true, 'draft', '9000']
		]);
		expect(week.unbilled).toEqual([
			{ clientId: client, clientName: 'Bäckerei Korn', minutes: 75, amountCents: '11250' }
		]);
	});

	it('closes a running entry at now', () => {
		const running = entry('2026-09-25T19:00:00+02:00', null);
		const week = projectWeek({
			monday: '2026-09-21',
			rows: [running],
			catalog,
			rates,
			now: evening
		});
		expect(week.rows[0]!.cells[0]).toMatchObject({ rawMinutes: 60, roundedMinutes: 60 });
		expect(week.rows[0]!.cells[0]!.derivation.entries).toEqual([
			{ id: running.id, startedAt: running.startedAt, endedAt: null }
		]);
	});
});

describe('budgetOf', () => {
	it('counts rounded billable minutes against the budget', () => {
		// eight cells of 67 minutes, 75 each after rounding: 600 of 600
		const rows = Array.from({ length: 8 }, (_, i) => {
			const day = String(1 + i).padStart(2, '0');
			return entry(`2026-09-${day}T09:00:00+02:00`, `2026-09-${day}T10:07:00+02:00`);
		});
		const budget = budgetOf(catalog.projects.get(project)!, rows, catalog, evening);
		expect(budget).toEqual({
			minutes: 600,
			usedMinutes: 600,
			state: budgetStatus(600, 600).state,
			explanation: budgetStatus(600, 600).explanation
		});
		expect(budget!.state).toBe('warn');

		const unbillable = rows.map((row) => ({ ...row, billable: false }));
		expect(
			budgetOf(catalog.projects.get(project)!, unbillable, catalog, evening)!.usedMinutes
		).toBe(0);
	});

	it('has nothing to say without a budget', () => {
		const open = { ...catalog.projects.get(project)!, budgetMinutes: null };
		expect(budgetOf(open, monday, catalog, evening)).toBeNull();
	});
});

describe('runningBudget', () => {
	it('adds the running timer up to now when it is billable', () => {
		const running = entry('2026-09-25T18:30:00+02:00', null);
		const finished = { budgetMinutes: 600, usedMinutes: 450 };
		expect(runningBudget(finished, running, true, evening)).toEqual({
			minutes: 600,
			usedMinutes: 540,
			state: budgetStatus(540, 600).state,
			explanation: budgetStatus(540, 600).explanation
		});
		expect(runningBudget(finished, running, false, evening).usedMinutes).toBe(450);
	});
});

describe('timerOf', () => {
	it('hints after twelve hours', () => {
		const running = entry('2026-09-25T08:00:00+02:00', null);
		expect(timerOf(running, null, evening)).toMatchObject({ state: 'running', hint: true });
		expect(timerOf(running, null, new Date('2026-09-25T19:59:00+02:00'))).toMatchObject({
			hint: false
		});
		expect(timerOf(undefined, null, evening)).toEqual({ state: 'idle' });
	});
});

describe('mondayOf', () => {
	it('moves any day to the monday of its week', () => {
		expect(mondayOf('2026-09-21')).toBe('2026-09-21');
		expect(mondayOf('2026-09-24')).toBe('2026-09-21');
		expect(mondayOf('2026-09-27')).toBe('2026-09-21');
	});
});

function work(startedAt: string, endedAt: string): EntryRow {
	return {
		id: `00000000-0000-4000-8000-${String(++lastId).padStart(12, '0')}`,
		employeeId: employee,
		workday: startedAt.slice(0, 10),
		startedAt,
		endedAt,
		endReason: 'leave',
		source: 'seed',
		requestId: null,
		voidedAt: null
	};
}

describe('weekCoverage', () => {
	it('compares each day with the stamped time', () => {
		const stamped = [work('2026-09-21T09:30:00+02:00', '2026-09-21T13:30:00+02:00')];
		const days = weekCoverage('2026-09-21', monday, stamped, evening);

		expect(days).toHaveLength(7);
		expect(days[0]).toEqual({
			date: '2026-09-21',
			projectMinutes: 67,
			workedMinutes: 240,
			coveredMinutes: 37,
			outsideMinutes: 30,
			unassignedMinutes: 203,
			hints: ['PROJECT_OUTSIDE_WORK']
		});
		expect(days[1]).toMatchObject({ projectMinutes: 0, workedMinutes: 0, hints: [] });
	});
});

describe('projectSummary', () => {
	it('sums minutes per person and project and names no amount', () => {
		const sheet: Sheet = {
			employee: {
				id: employee,
				name: 'Erika Muster',
				entryDate: '2025-01-01',
				exitDate: null,
				closedThrough: null
			},
			contracts: [],
			entries: [work('2026-09-21T09:00:00+02:00', '2026-09-21T14:00:00+02:00')],
			absences: [],
			acks: []
		};
		const summary = projectSummary({
			range: { from: '2026-09-21', to: '2026-09-27' },
			rows: monday,
			sheets: new Map([[employee, sheet]]),
			projectNames: new Map([[project, 'Website']]),
			now: evening
		});

		expect(summary).toEqual([
			{
				employeeId: employee,
				employeeName: 'Erika Muster',
				projectId: project,
				projectName: 'Website',
				minutes: 67,
				coverage: [
					expect.objectContaining({ date: '2026-09-21', projectMinutes: 67, workedMinutes: 300 })
				]
			}
		]);
		expect(JSON.stringify(summary)).not.toContain('amount');
	});
});

describe('fallback rounding', () => {
	it('leaves minutes as booked while neither client nor project override', () => {
		const plain: Catalog = {
			projects: new Map([
				[project, { ...catalog.projects.get(project)!, client: NO_OVERRIDE, project: NO_OVERRIDE }]
			]),
			tasks: catalog.tasks
		};
		const week = projectWeek({
			monday: '2026-09-21',
			rows: monday,
			catalog: plain,
			rates,
			now: evening
		});
		expect(week.weekTotal).toMatchObject({ rawMinutes: 67, roundedMinutes: 67 });
	});
});
