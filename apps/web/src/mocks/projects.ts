import {
	CalendarDateTime,
	getDayOfWeek,
	parseAbsolute,
	parseDate,
	startOfWeek,
	toCalendarDate,
	toZoned,
	today
} from '@internationalized/date';
import {
	createProjectEntrySchema,
	hasRole,
	projectWeekQuerySchema,
	startTimerSchema,
	updateProjectEntrySchema,
	weekdays,
	type BookableProject,
	type DayCoverage,
	type ErrorCode,
	type Project,
	type ProjectEntry,
	type ProjectSummary,
	type ProjectTimer,
	type ProjectWeek,
	type ProjectWeekCell,
	type ProjectWeekRow,
	type Role
} from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import type { z } from 'zod';
import { mockEmployees, teamIds } from './hr';
import { mockSession } from './session';
import { entriesOf } from './week';

export type ProjectWorld = 'company' | 'solo' | 'solo-empty' | 'solo-many';

type RateLevel = 'default' | 'client' | 'project';

type MockProject = {
	id: string;
	clientId: string;
	clientName: string;
	name: string;
	billable: boolean;
	budget: { minutes: number; share: number } | null;
	rate: { cents: number; level: RateLevel; validFrom: string };
	tasks: { id: string; name: string }[];
};

type Slot = { projectId: string; taskId: string | null };

const zone = 'Europe/Berlin';
const TIMER_HINT_MINUTES = 720;

const todayIso = () => today(zone).toString();
const addDays = (iso: string, days: number) => parseDate(iso).add({ days }).toString();
const weekdayOf = (iso: string) => weekdays[getDayOfWeek(parseDate(iso), 'de-DE')]!;
const mondayOf = (iso: string) => startOfWeek(parseDate(iso), 'de-DE').toString();
const dateOf = (instant: string) => toCalendarDate(parseAbsolute(instant, zone)).toString();

function at(date: string, minute: number) {
	const day = parseDate(date);
	const local = new CalendarDateTime(day.year, day.month, day.day).add({ minutes: minute });
	return toZoned(local, zone).toAbsoluteString();
}

const minuteOf = (instant: string, date: string) =>
	Math.round((Date.parse(instant) - Date.parse(at(date, 0))) / 60_000);

const hex = (n: number) => n.toString(16).padStart(12, '0');
const clientId = (n: number) => `3c9f1a70-2e4b-4d18-9a53-${hex(n)}`;
const projectId = (n: number) => `5e21b8d4-6a0f-4c37-8e92-${hex(n)}`;
const taskId = (n: number) => `8b47e2c1-9d3a-4f65-a0b8-${hex(n)}`;
const entryId = (date: string, i: number) =>
	`e3a8d5f1-7c2b-4e90-b6d4-${date.replaceAll('-', '')}${String(i).padStart(4, '0')}`;
const issuedInvoice = 'f0c2b6e8-3a9d-4f71-8c5e-000000000001';
const draftInvoice = 'f0c2b6e8-3a9d-4f71-8c5e-000000000002';

let nextTask = 1;
const tasks = (...names: string[]) => names.map((name) => ({ id: taskId(nextTask++), name }));

const project = (
	n: number,
	client: [number, string],
	name: string,
	rest: Partial<Pick<MockProject, 'billable' | 'budget' | 'rate' | 'tasks'>> = {}
): MockProject => ({
	id: projectId(n),
	clientId: clientId(client[0]),
	clientName: client[1],
	name,
	billable: true,
	budget: null,
	rate: { cents: 9500, level: 'default', validFrom: '2026-01-01' },
	tasks: [],
	...rest
});

function companyProjects(): MockProject[] {
	const hagen: [number, string] = [1, 'Bäckerei Hagen GmbH (Beispiel)'];
	const brinkmann: [number, string] = [2, 'Autohaus Brinkmann KG (Beispiel)'];
	const yilmaz: [number, string] = [3, 'Praxis Dr. Yilmaz (Beispiel)'];
	const overbeck: [number, string] = [4, 'Tischlerei Overbeck (Beispiel)'];
	const schulte: [number, string] = [5, 'Hofladen Schulte-Wessel (Beispiel)'];
	const rate = { cents: 9000, level: 'default' as const, validFrom: '2026-01-01' };
	return [
		project(1, hagen, 'Finanzbuchhaltung 2026', {
			rate,
			tasks: tasks('Belegerfassung', 'Abstimmung')
		}),
		project(2, hagen, 'Lohnabrechnung', { rate }),
		project(3, brinkmann, 'Jahresabschluss 2025', {
			budget: { minutes: 40 * 60, share: 0.85 },
			rate: { cents: 11000, level: 'client', validFrom: '2026-01-01' },
			tasks: tasks('Abstimmung', 'Beratung')
		}),
		project(4, yilmaz, 'Finanzbuchhaltung 2026', { rate }),
		project(5, overbeck, 'Jahresabschluss 2025', {
			budget: { minutes: 24 * 60, share: 1.08 },
			rate
		}),
		project(6, schulte, 'Erstgespräch Betriebsübergabe', { billable: false, rate })
	];
}

function soloProjects(): MockProject[] {
	const stadtwerke: [number, string] = [11, 'Stadtwerke (Beispiel)'];
	const nordlicht: [number, string] = [12, 'Agentur Nordlicht GmbH (Beispiel)'];
	const brandt: [number, string] = [13, 'Studio Brandt B.V. (Beispiel)'];
	const winkler: [number, string] = [14, 'Petra Winkler (Beispiel)'];
	return [
		project(11, stadtwerke, 'Kundenportal Wartung', {
			budget: { minutes: 60 * 60, share: 1.04 },
			rate: { cents: 11000, level: 'client', validFrom: '2026-01-01' }
		}),
		project(
			12,
			stadtwerke,
			'Barrierefreiheit nach BITV 2.0: Prüfung und Nachbesserung aller öffentlichen Formulare im Kundenportal',
			{ rate: { cents: 11000, level: 'client', validFrom: '2026-01-01' } }
		),
		project(13, nordlicht, 'Relaunch', {
			budget: { minutes: 120 * 60, share: 0.86 },
			tasks: tasks('Konzeption', 'Umsetzung', 'Abstimmung')
		}),
		project(14, brandt, 'Design-System', {
			rate: { cents: 10500, level: 'project', validFrom: '2026-03-01' }
		}),
		project(15, winkler, 'Praxis-Website Pflege')
	];
}

function manyProjects(): MockProject[] {
	const clients = [
		'Kanzlei Rehberg (Beispiel)',
		'Mühlenhof Kerkhoff (Beispiel)',
		'Radhaus Eilers (Beispiel)',
		'Stiftung Lindenhof (Beispiel)',
		'Weingut Aschoff (Beispiel)',
		'Zahnärzte am Markt (Beispiel)'
	];
	const names = ['Website Pflege', 'Relaunch 2026', 'Hosting-Umzug', 'SEO-Prüfung'];
	return clients.flatMap((client, c) =>
		names.map((name, p) =>
			project(21 + c * 4 + p, [21 + c, client], name, {
				budget: p === 1 ? { minutes: 40 * 60, share: [0.4, 0.82, 1.12][c % 3]! } : null
			})
		)
	);
}

function split(date: string, spans: [number, number][], picks: Slot[], skip: number) {
	const n = Number(date.slice(8)) + Number(date.slice(5, 7)) * 7;
	const parts: { from: number; to: number; pick: Slot }[] = [];
	spans.forEach(([from, to], i) => {
		const start = i === 0 ? from + skip : from;
		const count = 1 + ((n + i) % 3);
		const step = Math.floor((to - start) / count / 5) * 5;
		for (let j = 0; j < count; j++) {
			parts.push({
				from: start + j * step,
				to: j === count - 1 ? to : start + (j + 1) * step,
				pick: picks[(n + i * 2 + j) % picks.length]!
			});
		}
	});
	return parts.filter((part) => part.to > part.from);
}

const picksOf = (projects: MockProject[]) =>
	projects.flatMap((p): Slot[] =>
		p.tasks.length > 0
			? p.tasks.map((task) => ({ projectId: p.id, taskId: task.id }))
			: [{ projectId: p.id, taskId: null }]
	);

type Store = {
	world: ProjectWorld;
	amounts: boolean;
	rounding: { increment: number; mode: 'up' | 'nearest' };
	projects: MockProject[];
	entries: ProjectEntry[];
	usedBefore: Map<string, number>;
};

let store: Store;

const entry = (
	id: string,
	date: string,
	from: string,
	to: string | null,
	pick: Slot,
	source: ProjectEntry['source'] = 'seed'
): ProjectEntry => ({
	id,
	employeeId: mockSession.user.employeeId!,
	projectId: pick.projectId,
	taskId: pick.taskId,
	startedAt: from,
	endedAt: to,
	workday: date,
	note: null,
	billable: null,
	source,
	invoiceId: null,
	voidedAt: null
});

function companyDay(date: string, picks: Slot[]): ProjectEntry[] {
	const offset = parseDate(date).compare(parseDate(mondayOf(todayIso())));
	if (date === todayIso()) {
		const since = at(date, 8 * 60 + 31);
		return Date.parse(since) < Date.now()
			? [entry(entryId(date, 1), date, since, null, picks[0]!, 'timer')]
			: [];
	}
	if (offset === -2)
		return [entry(entryId(date, 1), date, at(date, 600), at(date, 735), picks[3]!, 'manual')];
	const work = entriesOf(date).filter((e) => e.endedAt !== null);
	if (work.length === 0) return [];
	const spans = work.map((e): [number, number] => [
		minuteOf(e.startedAt, date),
		minuteOf(e.endedAt!, date)
	]);
	const parts = split(date, spans, picks, offset === 0 ? 45 : 15);
	const extra: typeof parts = [];
	if (offset === 0 && spans.length > 1) {
		extra.push({ from: spans[0]![1] + 5, to: spans[0]![1] + 30, pick: picks[4]! });
	}
	if (offset === 1) {
		const end = spans.at(-1)![1];
		extra.push({ from: end + 30, to: end + 120, pick: picks[2]! });
	}
	return [...parts, ...extra]
		.toSorted((a, b) => a.from - b.from)
		.map((part, i) =>
			entry(entryId(date, i + 1), date, at(date, part.from), at(date, part.to), part.pick)
		);
}

function soloDay(date: string, picks: Slot[]): ProjectEntry[] {
	const n = Number(date.slice(8));
	if (date === todayIso()) {
		const since = at(date, 8 * 60 + 36);
		return Date.parse(since) < Date.now()
			? [entry(entryId(date, 1), date, since, null, picks[0]!, 'timer')]
			: [];
	}
	if (['sat', 'sun'].includes(weekdayOf(date))) return [];
	const start = 525 + ((n * 7) % 30);
	const lunch = 750 + ((n * 11) % 30);
	const parts = split(
		date,
		[
			[start, lunch],
			[lunch + 45, 1005 + ((n * 13) % 40)]
		],
		picks,
		0
	);
	return parts.map((part, i) =>
		entry(entryId(date, i + 1), date, at(date, part.from), at(date, part.to), part.pick)
	);
}

function manyDay(date: string, picks: Slot[], index: number): ProjectEntry[] {
	const yesterday = addDays(todayIso(), -1);
	if (date === todayIso()) return [];
	const slots = ['sat', 'sun'].includes(weekdayOf(date)) ? 0 : 8;
	const list = Array.from({ length: slots }, (_, k) =>
		entry(
			entryId(date, k + 1),
			date,
			at(date, 510 + k * 55),
			at(date, 560 + k * 55),
			picks[(index * 8 + k) % picks.length]!
		)
	);
	if (date === yesterday) {
		list.push(entry(entryId(date, 99), date, at(date, 16 * 60 + 40), null, picks[5]!, 'timer'));
	}
	return list;
}

function seed(world: ProjectWorld, projects: MockProject[]): ProjectEntry[] {
	if (world === 'solo-empty') return [];
	const picks = picksOf(projects);
	const first = addDays(mondayOf(todayIso()), -35);
	const entries: ProjectEntry[] = [];
	for (let date = first, i = 0; date <= todayIso(); date = addDays(date, 1), i++) {
		if (world === 'company') entries.push(...companyDay(date, picks));
		else if (world === 'solo') entries.push(...soloDay(date, picks));
		else entries.push(...manyDay(date, picks, i));
	}
	const monthStart = `${todayIso().slice(0, 7)}-01`;
	const draftFrom = addDays(mondayOf(todayIso()), -14);
	const billedClient = projects[0]?.clientId;
	return entries.map((e) => {
		const owner = projects.find((p) => p.id === e.projectId)!;
		if (e.workday < monthStart && owner.clientId === billedClient && e.endedAt) {
			return { ...e, invoiceId: issuedInvoice };
		}
		if (
			world === 'solo' &&
			owner.clientId === billedClient &&
			e.workday >= draftFrom &&
			e.workday < addDays(draftFrom, 7)
		) {
			return { ...e, invoiceId: draftInvoice };
		}
		return e;
	});
}

export function resetMockProjects(
	world: ProjectWorld = 'company',
	role: Role = mockSession.user.role
) {
	nextTask = 1;
	const projects =
		world === 'company'
			? companyProjects()
			: world === 'solo'
				? soloProjects()
				: world === 'solo-many'
					? manyProjects()
					: [];
	store = {
		world,
		amounts: world !== 'company' || hasRole(role, 'hr'),
		rounding:
			world === 'company' ? { increment: 15, mode: 'nearest' } : { increment: 15, mode: 'up' },
		projects,
		entries: seed(world, projects),
		usedBefore: new Map()
	};
	for (const p of projects) {
		if (!p.budget) continue;
		const booked = billedMinutes(p.id, '0000-01-01', '9999-12-31');
		p.budget.minutes = Math.max(p.budget.minutes, Math.ceil(booked / p.budget.share / 600) * 600);
		store.usedBefore.set(p.id, Math.round(p.budget.minutes * p.budget.share) - booked);
	}
}

const minutesOf = (e: ProjectEntry, now: number) =>
	Math.round(((e.endedAt ? Date.parse(e.endedAt) : now) - Date.parse(e.startedAt)) / 60_000);

function roundMinutes(raw: number) {
	const { increment, mode } = store.rounding;
	const below = Math.floor(raw / increment) * increment;
	const rest = raw - below;
	const rounded = rest > 0 && (mode === 'up' || 2 * rest >= increment) ? below + increment : below;
	return {
		minutes: rounded,
		explanation: { key: `billing.rounding.${mode}`, params: { raw, increment, rounded } }
	};
}

const live = () => store.entries.filter((e) => e.voidedAt === null);

type CellKey = string;

function cellsIn(from: string, to: string) {
	const now = Date.now();
	const cells = new Map<CellKey, ProjectEntry[]>();
	for (const e of live()) {
		if (e.workday < from || e.workday > to) continue;
		const key = [e.projectId, e.taskId ?? '', e.workday].join('|');
		cells.set(key, [...(cells.get(key) ?? []), e]);
	}
	return [...cells].map(([key, list]) => {
		const [pid, tid, date] = key.split('|') as [string, string, string];
		const owner = store.projects.find((p) => p.id === pid)!;
		const raw = list.reduce((sum, e) => sum + minutesOf(e, now), 0);
		return { owner, taskId: tid || null, date, list, raw, rounding: roundMinutes(raw) };
	});
}

function billedMinutes(pid: string, from: string, to: string) {
	return cellsIn(from, to)
		.filter((cell) => cell.owner.id === pid && cell.owner.billable)
		.reduce((sum, cell) => sum + cell.rounding.minutes, 0);
}

const amountOf = (owner: MockProject, minutes: number) =>
	store.amounts ? String(owner.billable ? Math.round((minutes * owner.rate.cents) / 60) : 0) : null;

function toCell(cell: ReturnType<typeof cellsIn>[number]): ProjectWeekCell {
	const { owner, list, raw, rounding, date } = cell;
	const lock = list.some((e) => e.invoiceId === issuedInvoice)
		? 'issued'
		: list.some((e) => e.invoiceId === draftInvoice)
			? 'draft'
			: 'none';
	return {
		date,
		rawMinutes: raw,
		roundedMinutes: rounding.minutes,
		amountCents: amountOf(owner, rounding.minutes),
		billable: owner.billable,
		lock,
		derivation: {
			entries: list.map((e) => ({ id: e.id, startedAt: e.startedAt, endedAt: e.endedAt })),
			rounding: rounding.explanation,
			rate:
				store.amounts && owner.billable
					? {
							cents: String(owner.rate.cents),
							explanation: {
								key: `billing.rate.${owner.rate.level}`,
								params: { cents: String(owner.rate.cents), validFrom: owner.rate.validFrom }
							}
						}
					: null
		}
	};
}

type Sums = { rawMinutes: number; roundedMinutes: number; amountCents: string | null };

const add = (list: Sums[]): Sums => ({
	rawMinutes: list.reduce((sum, s) => sum + s.rawMinutes, 0),
	roundedMinutes: list.reduce((sum, s) => sum + s.roundedMinutes, 0),
	amountCents: store.amounts
		? String(list.reduce((sum, s) => sum + Number(s.amountCents ?? 0), 0))
		: null
});

function coverageOf(date: string, now: number): DayCoverage {
	const future = date > todayIso();
	const spans = (list: { startedAt: string; endedAt: string | null }[]) =>
		list.map((e): [number, number] => [
			Date.parse(e.startedAt),
			e.endedAt ? Date.parse(e.endedAt) : now
		]);
	const work = future ? [] : spans(entriesOf(date));
	const project = spans(live().filter((e) => e.workday === date));
	const total = (list: [number, number][]) =>
		Math.round(list.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0) / 60_000);
	const covered = Math.round(
		project
			.flatMap(([a, b]) => work.map(([c, d]) => Math.max(0, Math.min(b, d) - Math.max(a, c))))
			.reduce((sum, ms) => sum + ms, 0) / 60_000
	);
	const projectMinutes = total(project);
	const workedMinutes = total(work);
	const hints: DayCoverage['hints'] = [];
	if (projectMinutes - workedMinutes > 5) hints.push('PROJECT_OVER_WORKED');
	if (projectMinutes - covered > 5) hints.push('PROJECT_OUTSIDE_WORK');
	return {
		date,
		projectMinutes,
		workedMinutes,
		coveredMinutes: covered,
		outsideMinutes: projectMinutes - covered,
		unassignedMinutes: workedMinutes - covered,
		hints
	};
}

function projectWeek(from: string): ProjectWeek {
	const to = addDays(from, 6);
	const now = Date.now();
	const cells = cellsIn(from, to);
	const rows = new Map<string, ProjectWeekRow>();
	for (const cell of cells) {
		const key = `${cell.owner.id}|${cell.taskId ?? ''}`;
		const task = cell.owner.tasks.find((t) => t.id === cell.taskId) ?? null;
		const row = rows.get(key) ?? {
			project: { id: cell.owner.id, name: cell.owner.name, clientName: cell.owner.clientName },
			task,
			cells: [],
			rowTotal: { rawMinutes: 0, roundedMinutes: 0, amountCents: null }
		};
		row.cells.push(toCell(cell));
		rows.set(key, row);
	}
	const list = [...rows.values()].map((row) => ({
		...row,
		cells: row.cells.toSorted((a, b) => a.date.localeCompare(b.date)),
		rowTotal: add(row.cells)
	}));
	const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
	const allCells = list.flatMap((row) => row.cells);
	const unbilled = new Map<
		string,
		{ clientId: string; clientName: string; minutes: number; amount: number }
	>();
	for (const cell of cellsIn('0000-01-01', todayIso())) {
		if (!cell.owner.billable || cell.list.some((e) => e.invoiceId !== null)) continue;
		const sum = unbilled.get(cell.owner.clientId) ?? {
			clientId: cell.owner.clientId,
			clientName: cell.owner.clientName,
			minutes: 0,
			amount: 0
		};
		sum.minutes += cell.rounding.minutes;
		sum.amount += Number(amountOf(cell.owner, cell.rounding.minutes) ?? 0);
		unbilled.set(cell.owner.clientId, sum);
	}
	return {
		from,
		rows: list,
		dayTotals: days.map((date) => ({ date, ...add(allCells.filter((c) => c.date === date)) })),
		weekTotal: add(allCells),
		coverage: store.world === 'company' ? days.map((date) => coverageOf(date, now)) : null,
		unbilled: [...unbilled.values()].map(({ amount, ...rest }) => ({
			...rest,
			amountCents: store.amounts ? String(amount) : null
		}))
	};
}

function timer(): ProjectTimer {
	const open = live().find((e) => e.endedAt === null);
	if (!open) return { state: 'idle' };
	const owner = store.projects.find((p) => p.id === open.projectId)!;
	return {
		state: 'running',
		entryId: open.id,
		projectId: open.projectId,
		taskId: open.taskId,
		since: open.startedAt,
		hint: Date.now() - Date.parse(open.startedAt) >= TIMER_HINT_MINUTES * 60_000,
		budget: owner.budget ? budgetOf(owner) : null
	};
}

function budgetOf(owner: MockProject) {
	const minutes = owner.budget!.minutes;
	const usedMinutes =
		(store.usedBefore.get(owner.id) ?? 0) + billedMinutes(owner.id, '0000-01-01', '9999-12-31');
	const state = usedMinutes > minutes ? 'exceeded' : usedMinutes * 5 >= minutes * 4 ? 'warn' : 'ok';
	return {
		minutes,
		usedMinutes,
		state,
		explanation: { key: `billing.budget.${state}`, params: { usedMinutes, budgetMinutes: minutes } }
	} as const;
}

const bookable = (): BookableProject[] =>
	store.projects.map((p) => ({
		id: p.id,
		name: p.name,
		clientName: p.clientName,
		billable: p.billable,
		tasks: p.tasks.map((t) => ({ ...t, billable: null }))
	}));

const asProject = (p: MockProject): Project => ({
	id: p.id,
	clientId: p.clientId,
	name: p.name,
	code: null,
	billable: p.billable,
	budget: p.budget ? budgetOf(p) : null,
	roundingIncrementMin: null,
	roundingMode: null,
	openToAll: true,
	archivedAt: null
});

function summary(team: string | undefined, from: string, to: string): ProjectSummary {
	const week = projectWeek(from);
	const members = mockEmployees.filter((e) => e.teamId === (team ?? teamIds.tax) && !e.exitDate);
	const factors = [1, 0.8, 1.15, 0.6, 0.9];
	return members.flatMap((member, i) =>
		week.rows
			.filter((_, r) => (r + i) % 3 !== 2)
			.map((row) => ({
				employeeId: member.id,
				employeeName: `${member.firstName} ${member.lastName}`,
				projectId: row.project.id,
				projectName: row.project.name,
				minutes: Math.round(row.rowTotal.rawMinutes * factors[i % factors.length]!),
				coverage: (week.coverage ?? [])
					.filter((day) => day.date <= to)
					.map((day) => (i === 1 ? day : { ...day, hints: [] }))
			}))
	);
}

const fail = (status: number, code: Exclude<ErrorCode, 'VALIDATION'>, message: string) =>
	HttpResponse.json({ code, message, details: null }, { status });

const invalid = (error: z.ZodError) =>
	HttpResponse.json(
		{
			code: 'VALIDATION',
			message: 'Invalid input',
			details: error.issues.map((issue) => ({
				field: issue.path.join('.'),
				code: issue.code,
				message: issue.message
			}))
		},
		{ status: 400 }
	);

const overlaps = (from: string, to: string, except?: string) => {
	const now = Date.now();
	return live().some(
		(e) =>
			e.id !== except &&
			Date.parse(from) < (e.endedAt ? Date.parse(e.endedAt) : now) &&
			Date.parse(e.startedAt) < Date.parse(to)
	);
};

const knows = (pick: { projectId: string; taskId?: string | null | undefined }) => {
	const owner = store.projects.find((p) => p.id === pick.projectId);
	return owner !== undefined && (!pick.taskId || owner.tasks.some((t) => t.id === pick.taskId));
};

const close = (at: string) => {
	store.entries = store.entries.map((e) =>
		e.endedAt === null && e.voidedAt === null ? { ...e, endedAt: at } : e
	);
};

resetMockProjects();

export const projectHandlers = [
	http.get('/api/project-timer', () => HttpResponse.json(timer())),

	http.post('/api/project-timer/start', async ({ request }) => {
		const parsed = startTimerSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		if (!knows(parsed.data)) return fail(403, 'FORBIDDEN', 'Project is not bookable');
		const now = new Date().toISOString();
		close(now);
		const date = dateOf(now);
		const slot = { projectId: parsed.data.projectId, taskId: parsed.data.taskId ?? null };
		store.entries.push({
			...entry(crypto.randomUUID(), date, now, null, slot, 'timer'),
			note: parsed.data.note ?? null
		});
		return HttpResponse.json(timer());
	}),

	http.post('/api/project-timer/stop', () => {
		if (timer().state === 'idle') return fail(409, 'INVALID_STATE', 'No timer running');
		close(new Date().toISOString());
		return HttpResponse.json(timer());
	}),

	http.get('/api/projects/bookable', () => HttpResponse.json(bookable())),

	http.get('/api/projects/budgets', () =>
		HttpResponse.json(store.projects.filter((p) => p.budget).map(asProject))
	),

	http.get('/api/employees/:id/project-week', ({ request }) => {
		const query = projectWeekQuerySchema.safeParse({
			from: new URL(request.url).searchParams.get('from')
		});
		if (!query.success) return invalid(query.error);
		return HttpResponse.json(projectWeek(query.data.from));
	}),

	http.get('/api/employees/:id/project-entries', ({ request }) => {
		const search = new URL(request.url).searchParams;
		const from = search.get('from') ?? '0000-01-01';
		const to = search.get('to') ?? '9999-12-31';
		const items = live().filter((e) => e.workday >= from && e.workday <= to);
		return HttpResponse.json({ items, nextCursor: null });
	}),

	http.get('/api/project-time/summary', ({ request }) => {
		const search = new URL(request.url).searchParams;
		const from = search.get('from')!;
		return HttpResponse.json(
			summary(search.get('team') ?? undefined, from, search.get('to') ?? addDays(from, 6))
		);
	}),

	http.post('/api/project-entries', async ({ request }) => {
		const parsed = createProjectEntrySchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const input = parsed.data;
		if (!knows(input)) return fail(403, 'FORBIDDEN', 'Project is not bookable');
		if (overlaps(input.startedAt, input.endedAt)) {
			return fail(409, 'TIME_OVERLAP', 'Overlaps another project entry');
		}
		const slot = { projectId: input.projectId, taskId: input.taskId ?? null };
		const created: ProjectEntry = {
			...entry(
				crypto.randomUUID(),
				dateOf(input.startedAt),
				input.startedAt,
				input.endedAt,
				slot,
				'manual'
			),
			note: input.note,
			billable: input.billable ?? null
		};
		store.entries.push(created);
		return HttpResponse.json(created, { status: 201 });
	}),

	http.patch('/api/project-entries/:id', async ({ params, request }) => {
		const parsed = updateProjectEntrySchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const found = live().find((e) => e.id === params.id);
		if (!found) return fail(404, 'NOT_FOUND', 'Project entry not found');
		if (found.invoiceId) return fail(409, 'INVOICED', 'Entry is on an invoice');
		if (!found.endedAt) return fail(409, 'INVALID_STATE', 'Only finished entries can change');
		const patch = parsed.data;
		const next: ProjectEntry = {
			...found,
			projectId: patch.projectId ?? found.projectId,
			taskId: patch.taskId === undefined ? found.taskId : patch.taskId,
			startedAt: patch.startedAt ?? found.startedAt,
			endedAt: patch.endedAt ?? found.endedAt,
			note: patch.note === undefined ? found.note : patch.note,
			billable: patch.billable === undefined ? found.billable : patch.billable
		};
		if (Date.parse(next.endedAt!) <= Date.parse(next.startedAt)) {
			return HttpResponse.json(
				{
					code: 'VALIDATION',
					message: 'Invalid input',
					details: [{ field: 'endedAt', code: 'custom', message: 'project.endBeforeStart' }]
				},
				{ status: 400 }
			);
		}
		if (overlaps(next.startedAt, next.endedAt!, found.id)) {
			return fail(409, 'TIME_OVERLAP', 'Overlaps another project entry');
		}
		const changed = { ...next, workday: dateOf(next.startedAt) };
		store.entries = store.entries.map((e) => (e.id === found.id ? changed : e));
		return HttpResponse.json(changed);
	}),

	http.post('/api/project-entries/:id/void', ({ params }) => {
		const found = live().find((e) => e.id === params.id);
		if (!found) return fail(404, 'NOT_FOUND', 'Project entry not found');
		if (found.invoiceId) return fail(409, 'INVOICED', 'Entry is on an invoice');
		store.entries = store.entries.map((e) =>
			e.id === found.id ? { ...e, voidedAt: new Date().toISOString() } : e
		);
		return new HttpResponse(null, { status: 204 });
	})
];
