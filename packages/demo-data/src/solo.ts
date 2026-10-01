import { Temporal } from 'temporal-polyfill';
import { eachDay, iso, isBusinessDay, local, weekdayFrom, type Calendar } from './calendar';
import type { PlanRow, SoloPlan } from './index';
import type { Random } from './random';

type Block = {
	date: Temporal.PlainDate;
	from: number;
	minutes: number;
	kind: 'morning' | 'afternoon' | 'short';
};

// prettier-ignore
const CLIENTS = [
	{ key: 'city', number: '1001', name: 'Stadtwerke Lindental AöR (Beispiel)', street: 'Am Wasserwerk 4', postalCode: '59494', city: 'Soest', countryCode: 'DE', isBusiness: true, vatId: 'DE298765431', email: 'rechnungseingang@stadtwerke-lindental.example.test', buyerReference: '05999-STADTWERKE-09', invoiceLocale: 'de', paymentTermsDays: 30 },
	{ key: 'agency', number: '1002', name: 'Agentur Nordlicht GmbH (Beispiel)', street: 'Harkortstraße 81', postalCode: '22765', city: 'Hamburg', countryCode: 'DE', isBusiness: true, vatId: 'DE312456789', email: 'buchhaltung@nordlicht.example.test', buyerReference: null, invoiceLocale: 'de', paymentTermsDays: null },
	{ key: 'studio', number: '1003', name: 'Studio Brandt B.V. (Beispiel)', street: 'Keizersgracht 312', postalCode: '1016 EZ', city: 'Amsterdam', countryCode: 'NL', isBusiness: true, vatId: 'NL859012345B01', email: 'accounts@studio-brandt.example.test', buyerReference: null, invoiceLocale: 'en', paymentTermsDays: null },
	{ key: 'private', number: '1004', name: 'Martina Seidel (Beispiel)', street: 'Wolbecker Straße 58', postalCode: '48155', city: 'Münster', countryCode: 'DE', isBusiness: false, vatId: null, email: 'martina.seidel@example.test', buyerReference: null, invoiceLocale: 'de', paymentTermsDays: null }
] as const;

// prettier-ignore
const PROJECTS = [
	{ key: 'portal', client: 'city', name: 'Kundenportal Zählerstände', code: 'SWL-PORTAL', budgetMinutes: 60 * 60, tasks: ['Entwicklung', 'Abstimmung'] },
	{ key: 'relaunch', client: 'agency', name: 'Relaunch', code: 'NL-RELAUNCH', budgetMinutes: 120 * 60, tasks: ['Frontend', 'Backend', 'Abstimmung'] },
	{ key: 'upkeep', client: 'agency', name: 'Wartung', code: 'NL-WARTUNG', budgetMinutes: null, tasks: [] },
	{ key: 'api', client: 'studio', name: 'Booking API', code: 'SB-API', budgetMinutes: null, tasks: ['Development', 'Code review'] },
	{ key: 'club', client: 'private', name: 'Website Kanuverein', code: 'SEIDEL-WEB', budgetMinutes: null, tasks: [] }
] as const;

type ProjectKey = (typeof PROJECTS)[number]['key'];

// minutes in total for these, whole quarter hours so no rounding rule moves the budgets
const TARGETS: Partial<Record<ProjectKey, number>> = {
	portal: 3750,
	relaunch: 6180,
	club: 690
};

const quarter = (rng: Random, min: number, max: number) => 15 * rng.int(min / 15, max / 15);

export function soloWorld(rng: Random, calendar: Calendar): SoloPlan {
	const { year } = calendar;
	const tenantId = rng.uuid();
	const tag = tenantId.slice(0, 8);
	const employeeId = rng.uuid();

	const clients = CLIENTS.map(({ key, ...client }) => ({
		key,
		row: {
			id: rng.uuid(),
			...client,
			roundingIncrementMin: null,
			roundingMode: null
		} satisfies PlanRow<'clients'>
	}));
	const projects = PROJECTS.map((project) => {
		const clientId = clients.find((client) => client.key === project.client)!.row.id;
		const id = rng.uuid();
		return {
			key: project.key,
			row: {
				id,
				clientId,
				name: project.name,
				code: project.code,
				budgetMinutes: project.budgetMinutes
			} satisfies PlanRow<'projects'>,
			tasks: project.tasks.map((name) => ({ id: rng.uuid(), clientId, projectId: id, name }))
		};
	});
	const project = (key: ProjectKey) => projects.find((candidate) => candidate.key === key)!;
	const clientId = (key: (typeof CLIENTS)[number]['key']) =>
		clients.find((client) => client.key === key)!.row.id;

	const validFrom = `${year - 1}-01-01`;
	const rates: PlanRow<'rates'>[] = [
		{ clientId: null, rateCents: 9500 },
		// framework agreement of the public client
		{ clientId: clientId('city'), rateCents: 8900 },
		{ clientId: clientId('studio'), rateCents: 11000 },
		{ clientId: clientId('private'), rateCents: 7500 }
	].map((rate) => ({
		id: rng.uuid(),
		projectId: null,
		taskId: null,
		employeeId: null,
		validFrom,
		...rate
	}));

	// two weeks off in august, now and then a day without billable work
	const summer = weekdayFrom(Temporal.PlainDate.from({ year, month: 8, day: 10 }), 1);
	const blocks: Block[] = [];
	for (const date of eachDay(calendar.start, calendar.yesterday)) {
		if (!isBusinessDay(calendar, date)) continue;
		const away = Temporal.PlainDate.compare(date, summer) >= 0 && date.since(summer).days < 14;
		if (away || rng.int(0, 11) === 0) continue;
		const morning = quarter(rng, 525, 570);
		const first = quarter(rng, 150, 225);
		const afternoon = morning + first + quarter(rng, 45, 75);
		const second = quarter(rng, 120, 210);
		blocks.push(
			{ date, from: morning, minutes: first, kind: 'morning' },
			{ date, from: afternoon, minutes: second, kind: 'afternoon' }
		);
		if (rng.int(0, 9) < 3) {
			blocks.push({ date, from: afternoon + second, minutes: quarter(rng, 30, 60), kind: 'short' });
		}
	}

	const left = new Map(Object.entries(TARGETS));
	const taskOf = (key: ProjectKey) => {
		const tasks = project(key).tasks;
		if (tasks.length === 0) return null;
		return rng.int(0, 9) < 6 ? tasks[0]! : rng.pick(tasks);
	};
	const pick = (block: Block): ProjectKey => {
		if (block.kind === 'short') return left.get('relaunch')! > 0 ? 'relaunch' : 'upkeep';
		if (block.kind === 'morning' && left.get('relaunch')! > 0) return 'relaunch';
		if (block.kind === 'afternoon' && left.get('portal')! > 0) return 'portal';
		if ([4, 5].includes(block.date.month) && left.get('club')! > 0 && rng.int(0, 3) === 0) {
			return 'club';
		}
		return rng.int(0, 9) < 6 ? 'api' : 'upkeep';
	};

	// from yesterday backwards, so the budgeted projects are the ones still running
	const entries: PlanRow<'projectEntries'>[] = [];
	for (const block of blocks.toReversed()) {
		const key = pick(block);
		const rest = left.get(key);
		const minutes = rest === undefined ? block.minutes : Math.min(block.minutes, rest);
		if (rest !== undefined) left.set(key, rest - minutes);
		const task =
			key === 'relaunch' && block.kind === 'short'
				? project(key).tasks.find((candidate) => candidate.name === 'Abstimmung')!
				: taskOf(key);
		entries.push({
			id: rng.uuid(),
			employeeId,
			projectId: project(key).row.id,
			taskId: task?.id ?? null,
			startedAt: iso(local(block.date, block.from)),
			endedAt: iso(local(block.date, block.from + minutes)),
			note: null
		});
	}
	entries.push({
		id: rng.uuid(),
		employeeId,
		projectId: project('api').row.id,
		taskId: project('api').tasks[0]!.id,
		startedAt: iso(local(calendar.today, 510 + rng.int(0, 9), rng.int(0, 59))),
		endedAt: null,
		note: null
	});

	return {
		tenant: {
			id: tenantId,
			name: 'Lena Vogt – Softwareentwicklung (Beispiel)',
			slug: `lena-vogt-${tag}`,
			state: 'NW'
		},
		employee: {
			id: employeeId,
			personnelNo: '1',
			firstName: 'Lena',
			lastName: 'Vogt',
			entryDate: `${year - 3}-04-01`
		},
		user: {
			id: rng.uuid(),
			email: `lena.vogt+${tag}@example.test`,
			displayName: 'Lena Vogt'
		},
		clients: clients.map((client) => client.row),
		projects: projects.map((candidate) => candidate.row),
		tasks: projects.flatMap((candidate) => candidate.tasks),
		rates,
		projectEntries: entries.toReversed()
	};
}
