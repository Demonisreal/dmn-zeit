import { roundMinutes } from '@zeit/rules';
import { Temporal } from 'temporal-polyfill';
import { dateOf, iso, local, type Calendar } from './calendar';
import type { PlanRow, ProjectBook } from './index';
import { isAway, type Leave } from './leave';
import type { Random } from './random';
import type { Sheet } from './shifts';
import type { Cast, Person } from './staff';

type Work = 'books' | 'payroll' | 'closing';

// the three teams of the office, each works on its own kind of project
const WORK: readonly Work[] = ['books', 'payroll', 'closing'];

const TASKS: Record<Work, readonly string[]> = {
	books: ['Belegerfassung', 'Abstimmung', 'Beratung'],
	payroll: ['Abrechnung', 'Meldungen', 'Beratung'],
	closing: ['Abschlussbuchungen', 'Beratung']
};

// prettier-ignore
const CLIENTS = [
	{ code: 'HAG', name: 'Bäckerei Hagen GmbH (Beispiel)', street: 'Elberfelder Straße 41', postalCode: '58095', city: 'Hagen', work: ['books', 'payroll', 'closing'] },
	{ code: 'LIN', name: 'Autohaus Lindner KG (Beispiel)', street: 'Westfalendamm 212', postalCode: '44141', city: 'Dortmund', work: ['books', 'closing'] },
	{ code: 'YIL', name: 'Zahnarztpraxis Dr. Yılmaz (Beispiel)', street: 'Kortumstraße 18', postalCode: '44787', city: 'Bochum', work: ['books', 'payroll'] },
	{ code: 'RUE', name: 'Metallbau Rüther GmbH & Co. KG (Beispiel)', street: 'Am Hohen Hagen 7', postalCode: '58515', city: 'Lüdenscheid', work: ['books', 'payroll', 'closing'] },
	{ code: 'ZLI', name: 'Gasthaus Zur Linde (Beispiel)', street: 'Hagener Straße 90', postalCode: '58239', city: 'Schwerte', work: ['books', 'payroll'] },
	{ code: 'SON', name: 'Pflegedienst Sonnenhof gGmbH (Beispiel)', street: 'Massener Straße 33', postalCode: '59423', city: 'Unna', work: ['payroll', 'closing'] }
] as const;

// time fee of § 13 StBVV: every half hour begun counts in full
const ROUNDING = { increment: 30, mode: 'up' } as const;
const rounded = (minutes: number) => roundMinutes(minutes, ROUNDING).minutes;

// the story wants one closing near its budget and one beyond; booking stops once the mark is reached
const BUDGETS: Partial<Record<string, { minutes: number; stopAt: number }>> = {
	'HAG-JA': { minutes: 40 * 60, stopAt: 34 * 60 },
	'LIN-JA': { minutes: 30 * 60, stopAt: 31.5 * 60 }
};

type Running = {
	person: Person;
	projectId: string;
	taskId: string;
	start: Temporal.Instant;
	note: string | null;
};

type Part = Running & { end: Temporal.Instant };

const minutesOf = (start: Temporal.Instant, end: Temporal.Instant) =>
	Math.round(start.until(end).total('minutes'));

// offsets from the start of a stamped span; a few minutes at the edges stay without project
function split(rng: Random, length: number, exact: boolean): [number, number][] {
	const lead = exact ? 0 : rng.int(0, 6);
	const tail = exact ? 0 : rng.int(0, 8);
	const room = length - lead - tail;
	if (room < 20) return exact ? [[0, length]] : [];
	const roll = rng.int(0, 19);
	const count = Math.max(1, Math.min(roll < 9 ? 1 : roll < 17 ? 2 : 3, Math.floor(room / 45)));
	const size = room / count;
	const wobble = Math.floor(size / 4);
	const parts: [number, number][] = [];
	let from = lead;
	for (let i = 1; i <= count; i++) {
		const to = i === count ? lead + room : lead + Math.round(i * size) + rng.int(-wobble, wobble);
		const gap = exact || i === count ? 0 : rng.int(0, 3);
		parts.push([from, to - gap]);
		from = to;
	}
	return parts;
}

const lastDay = (sheet: Sheet) =>
	sheet.entries
		.filter((entry) => entry.endedAt !== null)
		.map((entry) => dateOf(Temporal.Instant.from(entry.startedAt)))
		.reduce((a, b) => (Temporal.PlainDate.compare(a, b) >= 0 ? a : b));

export function bookProjects(
	rng: Random,
	cast: Cast,
	calendar: Calendar,
	sheets: ReadonlyMap<Person, Sheet>,
	leaves: readonly Leave[]
): ProjectBook {
	const { year } = calendar;
	const clients: PlanRow<'clients'>[] = [];
	const projects: (PlanRow<'projects'> & {
		work: Work;
		tasks: PlanRow<'tasks'>[];
		stopAt: number | null;
	})[] = [];

	CLIENTS.forEach((client, i) => {
		const clientId = rng.uuid();
		clients.push({
			id: clientId,
			number: String(10001 + i),
			name: client.name,
			street: client.street,
			postalCode: client.postalCode,
			city: client.city,
			countryCode: 'DE',
			isBusiness: true,
			vatId: null,
			email: `buchhaltung@${client.code.toLowerCase()}.example.test`,
			buyerReference: null,
			invoiceLocale: 'de',
			paymentTermsDays: null,
			roundingIncrementMin: ROUNDING.increment,
			roundingMode: ROUNDING.mode
		});
		for (const work of client.work) {
			const projectId = rng.uuid();
			const code = `${client.code}-${{ books: 'FIBU', payroll: 'LOHN', closing: 'JA' }[work]}`;
			projects.push({
				id: projectId,
				clientId,
				name: {
					books: `Finanzbuchhaltung ${year}`,
					payroll: `Lohnabrechnung ${year}`,
					closing: `Jahresabschluss ${year - 1}`
				}[work],
				code,
				budgetMinutes: BUDGETS[code]?.minutes ?? null,
				stopAt: BUDGETS[code]?.stopAt ?? null,
				work,
				tasks: TASKS[work].map((name) => ({ id: rng.uuid(), clientId, projectId, name }))
			});
		}
	});
	const byCode = (code: string) => projects.find((project) => project.code === code)!;
	const taskOf = (project: (typeof projects)[number], name: string) =>
		project.tasks.find((task) => task.name === name)!;

	const validFrom = `${year - 1}-01-01`;
	const rates: PlanRow<'rates'>[] = [
		{ clientId: null, projectId: null, rateCents: 9600, employeeId: null },
		{ clientId: byCode('RUE-FIBU').clientId, projectId: null, rateCents: 10200, employeeId: null },
		{ clientId: byCode('SON-LOHN').clientId, projectId: null, rateCents: 8800, employeeId: null },
		// the closing of the bakery goes through the senior of the team
		{
			clientId: byCode('HAG-JA').clientId,
			projectId: byCode('HAG-JA').id,
			rateCents: 13200,
			employeeId: cast.capped.employee.id
		}
	].map((rate) => ({ id: rng.uuid(), taskId: null, validFrom, ...rate }));

	// project time starts with the previous month, a whole year of it takes the sandbox past 1.5 s
	const from = calendar.previous.toPlainDate({ day: 1 });
	const spans = cast.people
		.flatMap((person) =>
			sheets
				.get(person)!
				.entries.filter((entry) => entry.endedAt !== null)
				.map((entry) => ({
					person,
					start: Temporal.Instant.from(entry.startedAt),
					end: Temporal.Instant.from(entry.endedAt!)
				}))
		)
		.filter((span) => Temporal.PlainDate.compare(dateOf(span.start), from) >= 0)
		.sort((a, b) => Temporal.Instant.compare(a.start, b.start));

	// the persona's last working day before today books more project time than she was clocked in
	const overDay = lastDay(sheets.get(cast.worker)!);
	const used = new Map<string, number>();
	const cells = new Map<string, number>();
	const full = new Set<string>();
	const parts: Part[] = [];

	for (const span of spans) {
		const exact = span.person === cast.worker && dateOf(span.start).equals(overDay);
		if (!exact && rng.int(0, 39) === 0) continue;
		const work = WORK[span.person.team]!;
		for (const [offset, until] of split(rng, minutesOf(span.start, span.end), exact)) {
			const project = rng.pick(
				projects.filter((candidate) => candidate.work === work && !full.has(candidate.id))
			);
			const tasks = project.tasks;
			const task = rng.int(0, 9) < 6 ? tasks[0]! : rng.pick(tasks.slice(1));
			const start = span.start.add({ minutes: offset });
			const end = span.start.add({ minutes: until });
			parts.push({
				person: span.person,
				projectId: project.id,
				taskId: task.id,
				start,
				end,
				note: null
			});

			if (project.stopAt === null) continue;
			// the same cell the project week and the budget read: person, task and day, rounded once
			const cell = `${span.person.employee.id} ${task.id} ${dateOf(start).toString()}`;
			const before = cells.get(cell) ?? 0;
			const raw = before + minutesOf(start, end);
			cells.set(cell, raw);
			const total = (used.get(project.id) ?? 0) + rounded(raw) - rounded(before);
			used.set(project.id, total);
			if (total >= project.stopAt) full.add(project.id);
		}
	}

	const last = parts.findLast((part) => part.person === cast.worker)!;
	last.end = last.end.add({ minutes: rng.int(35, 50) });

	// one colleague left the timer running yesterday, the other booked a saturday without clocking in
	const busyLater =
		Temporal.PlainDate.compare(
			lastDay(sheets.get(cast.busy)!),
			lastDay(sheets.get(cast.partTimer)!)
		) >= 0;
	const forgot = busyLater ? cast.busy : cast.partTimer;
	const weekend = busyLater ? cast.partTimer : cast.busy;
	const forgotAt = local(lastDay(sheets.get(forgot)!), 1000);
	const kept = parts.filter(
		(part) => part.person !== forgot || Temporal.Instant.compare(part.start, forgotAt) < 0
	);
	for (const part of kept) {
		if (part.person === forgot && Temporal.Instant.compare(part.end, forgotAt) > 0) {
			part.end = forgotAt;
		}
	}

	let saturday = calendar.today.subtract({ days: (calendar.today.dayOfWeek + 1) % 7 || 7 });
	while (isAway(leaves, weekend, saturday)) saturday = saturday.subtract({ days: 7 });
	const saturdayStart = local(saturday, 600 + rng.int(0, 20));

	const shift = sheets
		.get(cast.worker)!
		.entries.find(
			(entry) =>
				entry.endedAt === null &&
				dateOf(Temporal.Instant.from(entry.startedAt)).equals(calendar.today)
		)!;
	const books = projects.filter((project) => project.work === 'books');
	const timerProject = rng.pick(books);
	const forgotProject = rng.pick(books);
	const weekendProject = rng.pick(books);

	const running: Running[] = [
		{
			person: cast.worker,
			projectId: timerProject.id,
			taskId: taskOf(timerProject, 'Belegerfassung').id,
			start: Temporal.Instant.from(shift.startedAt).add({ minutes: rng.int(2, 6) }),
			note: null
		},
		{
			person: forgot,
			projectId: forgotProject.id,
			taskId: taskOf(forgotProject, 'Abstimmung').id,
			start: forgotAt,
			note: null
		}
	];
	kept.push({
		person: weekend,
		projectId: weekendProject.id,
		taskId: taskOf(weekendProject, 'Belegerfassung').id,
		start: saturdayStart,
		end: saturdayStart.add({ minutes: 150 + rng.int(0, 30) }),
		note: 'Unterlagen für die Betriebsprüfung vorbereitet'
	});

	const row = (part: Running, end: Temporal.Instant | null): PlanRow<'projectEntries'> => ({
		id: rng.uuid(),
		employeeId: part.person.employee.id,
		projectId: part.projectId,
		taskId: part.taskId,
		startedAt: iso(part.start),
		endedAt: end && iso(end),
		note: part.note
	});

	return {
		clients,
		projects: projects.map(({ id, clientId, name, code, budgetMinutes }) => ({
			id,
			clientId,
			name,
			code,
			budgetMinutes
		})),
		tasks: projects.flatMap((project) => project.tasks),
		rates,
		projectEntries: [
			...kept.map((part) => row(part, part.end)),
			...running.map((part) => row(part, null))
		]
	};
}
