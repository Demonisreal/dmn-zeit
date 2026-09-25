import { today } from '@internationalized/date';
import {
	createClientSchema,
	createProjectSchema,
	createRateSchema,
	createTaskSchema,
	updateClientSchema,
	updateProjectSchema,
	updateTaskSchema,
	type BudgetStatus,
	type Client,
	type ErrorCode,
	type Project,
	type Rate,
	type Task
} from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { z, type ZodError } from 'zod';
import { mockEmployees } from './hr';
import type { ProjectWorld } from './projects';
import { mockSession } from './session';

// clients, projects and tasks carry the ids of mocks/projects.ts, so the week and the timer link here

type MockProject = Omit<Project, 'budget'> & {
	budgetMinutes: number | null;
	usedMinutes: number;
	members: string[];
};

const hex = (n: number) => n.toString(16).padStart(12, '0');
const clientId = (n: number) => `3c9f1a70-2e4b-4d18-9a53-${hex(n)}`;
const projectId = (n: number) => `5e21b8d4-6a0f-4c37-8e92-${hex(n)}`;
const taskId = (n: number) => `8b47e2c1-9d3a-4f65-a0b8-${hex(n)}`;
const rateId = (n: number) => `7d3e9b25-4f1a-4c68-b2d7-${hex(n)}`;

const todayIso = () => today('Europe/Berlin').toString();
const nextYear = () => `${Number(todayIso().slice(0, 4)) + 1}-01-01`;
const personId = (lastName: string) => mockEmployees.find((e) => e.lastName === lastName)!.id;

const client = (n: number, name: string, rest: Partial<Client> = {}): Client => ({
	id: clientId(n),
	number: null,
	name,
	street: null,
	postalCode: null,
	city: null,
	countryCode: 'DE',
	isBusiness: true,
	vatId: null,
	email: null,
	buyerReference: null,
	invoiceLocale: 'de',
	paymentTermsDays: null,
	roundingIncrementMin: null,
	roundingMode: null,
	archivedAt: null,
	restrictedAt: null,
	...rest
});

type ProjectRest = Partial<
	Pick<MockProject, 'code' | 'billable' | 'openToAll' | 'members' | 'archivedAt'>
> & {
	budget?: [hours: number, share: number] | undefined;
};

const project = (n: number, owner: number, name: string, rest: ProjectRest = {}): MockProject => {
	const { budget, ...fields } = rest;
	return {
		id: projectId(n),
		clientId: clientId(owner),
		name,
		code: null,
		billable: true,
		roundingIncrementMin: null,
		roundingMode: null,
		openToAll: true,
		archivedAt: null,
		budgetMinutes: budget ? budget[0] * 60 : null,
		usedMinutes: budget ? Math.round(budget[0] * 60 * budget[1]) : 0,
		members: [],
		...fields
	};
};

const task = (n: number, owner: number, name: string): Task => ({
	id: taskId(n),
	projectId: projectId(owner),
	name,
	billable: null,
	archivedAt: null
});

const rate = (
	n: number,
	validFrom: string,
	euros: number,
	on: { client?: number; project?: number; task?: number; employee?: string } = {}
): Rate => ({
	id: rateId(n),
	clientId: on.client ? clientId(on.client) : null,
	projectId: on.project ? projectId(on.project) : null,
	taskId: on.task ? taskId(on.task) : null,
	employeeId: on.employee ?? null,
	validFrom,
	rateCents: String(euros * 100),
	createdBy: mockSession.user.id
});

type World = { clients: Client[]; projects: MockProject[]; tasks: Task[]; rates: Rate[] };

// mara's tax office: the clients of the project week plus a long name, one without projects, one archived
function companyWorld(): World {
	return {
		clients: [
			client(1, 'Bäckerei Hagen GmbH (Beispiel)', {
				number: 'K-1001',
				street: 'Marktstraße 12',
				postalCode: '44135',
				city: 'Dortmund'
			}),
			client(2, 'Autohaus Brinkmann KG (Beispiel)', {
				number: 'K-1002',
				street: 'Westfalendamm 88',
				postalCode: '44141',
				city: 'Dortmund',
				paymentTermsDays: 14
			}),
			client(3, 'Praxis Dr. Yilmaz (Beispiel)', { number: 'K-1003', city: 'Unna' }),
			client(4, 'Tischlerei Overbeck (Beispiel)', {
				number: 'K-1004',
				city: 'Schwerte',
				roundingIncrementMin: 30,
				roundingMode: 'up'
			}),
			client(5, 'Hofladen Schulte-Wessel (Beispiel)', { number: 'K-1005', city: 'Werne' }),
			client(
				6,
				'Förderverein der Offenen Ganztagsschule an der Kreuzgrundschule Dortmund-Innenstadt-Nord e. V. (Beispiel)',
				{ number: 'K-1006', city: 'Dortmund' }
			),
			client(7, 'Elektro Kaya (Beispiel)', { number: 'K-1007', city: 'Kamen' }),
			client(8, 'Friseursalon Beckmann (Beispiel)', {
				number: 'K-0998',
				city: 'Lünen',
				archivedAt: '2026-03-31T16:00:00+02:00'
			})
		],
		projects: [
			project(1, 1, 'Finanzbuchhaltung 2026'),
			project(2, 1, 'Lohnabrechnung'),
			project(3, 2, 'Jahresabschluss 2025', {
				code: 'JA25-BRI',
				budget: [40, 0.85],
				openToAll: false,
				members: [personId('Hölscher'), mockSession.user.employeeId!]
			}),
			project(4, 3, 'Finanzbuchhaltung 2026'),
			project(5, 4, 'Jahresabschluss 2025', { budget: [24, 1.08] }),
			project(6, 5, 'Erstgespräch Betriebsübergabe', { billable: false }),
			project(7, 6, 'Jahresabschluss 2025', { code: 'JA25-OGS' }),
			project(8, 8, 'Finanzbuchhaltung 2025', { archivedAt: '2026-03-31T16:00:00+02:00' })
		],
		tasks: [
			task(1, 1, 'Belegerfassung'),
			task(2, 1, 'Abstimmung'),
			task(3, 3, 'Abstimmung'),
			task(4, 3, 'Beratung')
		],
		rates: [
			rate(1, '2025-01-01', 85),
			rate(2, '2026-01-01', 90),
			rate(3, nextYear(), 95),
			rate(4, '2026-01-01', 110, { client: 2 }),
			rate(5, '2026-01-01', 125, { client: 2, project: 3, task: 4 }),
			rate(6, '2026-01-01', 130, { client: 2, project: 3, employee: personId('Hölscher') }),
			rate(7, nextYear(), 120, { client: 2 })
		]
	};
}

function soloWorld(): World {
	return {
		clients: [
			client(11, 'Stadtwerke (Beispiel)', {
				number: 'SW-01',
				street: 'Hafenstraße 1',
				postalCode: '48153',
				city: 'Münster',
				email: 'rechnung@stadtwerke.example',
				buyerReference: '05515000-00012-34',
				paymentTermsDays: 30
			}),
			client(12, 'Agentur Nordlicht GmbH (Beispiel)', {
				number: 'NL-01',
				street: 'Große Elbstraße 145',
				postalCode: '22767',
				city: 'Hamburg',
				vatId: 'DE123456789',
				paymentTermsDays: 14
			}),
			client(13, 'Studio Brandt B.V. (Beispiel)', {
				street: 'Keizersgracht 221',
				postalCode: '1016 DV',
				city: 'Amsterdam',
				countryCode: 'NL',
				vatId: 'NL123456789B01',
				invoiceLocale: 'en'
			}),
			client(14, 'Petra Winkler (Beispiel)', {
				street: 'Am Sparrenberg 3',
				postalCode: '33602',
				city: 'Bielefeld',
				isBusiness: false
			})
		],
		projects: [
			project(11, 11, 'Kundenportal Wartung', { budget: [60, 1.04] }),
			project(
				12,
				11,
				'Barrierefreiheit nach BITV 2.0: Prüfung und Nachbesserung aller öffentlichen Formulare im Kundenportal'
			),
			project(13, 12, 'Relaunch', { code: 'NL-RL', budget: [120, 0.86] }),
			project(14, 13, 'Design-System'),
			project(15, 14, 'Praxis-Website Pflege')
		],
		tasks: [task(1, 13, 'Konzeption'), task(2, 13, 'Umsetzung'), task(3, 13, 'Abstimmung')],
		rates: [
			rate(1, '2026-01-01', 95),
			rate(2, nextYear(), 100),
			rate(3, '2026-01-01', 110, { client: 11 }),
			rate(4, '2026-03-01', 105, { client: 13, project: 14 }),
			rate(5, '2026-01-01', 110, { client: 12, project: 13, task: 1 })
		]
	};
}

const agencyJobs = [
	'Kontaktformular',
	'Cookie-Hinweis',
	'Shop-Anbindung',
	'Newsletter-Anmeldung',
	'Startseite barrierefrei',
	'Terminbuchung',
	'Karriereseite',
	'Mehrsprachigkeit',
	'Bildergalerie',
	'Suchfunktion',
	'Ladezeit verbessern',
	'Impressum und Datenschutz',
	'Veranstaltungskalender',
	'Kundenlogin',
	'Produktfilter',
	'Blog-Umzug',
	'Standortkarte',
	'Formular-Validierung',
	'Druckansicht',
	'Sitemap',
	'Rechnungsdownload',
	'Wartungsvertrag 2026'
];

// the clients of the busy week plus an agency with a project per job, more than 20 of them
function manyWorld(): World {
	const names = [
		'Kanzlei Rehberg (Beispiel)',
		'Mühlenhof Kerkhoff (Beispiel)',
		'Radhaus Eilers (Beispiel)',
		'Stiftung Lindenhof (Beispiel)',
		'Weingut Aschoff (Beispiel)',
		'Zahnärzte am Markt (Beispiel)'
	];
	const jobs = ['Website Pflege', 'Relaunch 2026', 'Hosting-Umzug', 'SEO-Prüfung'];
	return {
		clients: [
			...names.map((name, c) => client(21 + c, name)),
			client(27, 'Agentur Wellenreiter GmbH (Beispiel)', { number: 'WR', city: 'Kiel' })
		],
		projects: [
			...names.flatMap((_, c) =>
				jobs.map((job, p) =>
					project(21 + c * 4 + p, 21 + c, job, {
						budget: p === 1 ? [40, [0.4, 0.82, 1.12][c % 3]!] : undefined
					})
				)
			),
			...agencyJobs.map((job, i) =>
				project(51 + i, 27, `Auftrag ${String(i + 1).padStart(2, '0')}: ${job}`, {
					code: `WR-${String(i + 1).padStart(3, '0')}`
				})
			)
		],
		tasks: [],
		rates: [rate(1, '2026-01-01', 85), rate(2, '2026-01-01', 78, { client: 27 })]
	};
}

const worlds: Record<ProjectWorld, () => World> = {
	company: companyWorld,
	solo: soloWorld,
	'solo-many': manyWorld,
	// a freshly invited freelancer, nothing set up yet
	'solo-empty': () => ({ clients: [], projects: [], tasks: [], rates: [] })
};

let world: ProjectWorld = 'company';
let store = companyWorld();

export function resetMockBilling(next: ProjectWorld = 'company') {
	world = next;
	store = worlds[next]();
}

function budgetOf(owner: MockProject): BudgetStatus | null {
	const minutes = owner.budgetMinutes;
	if (minutes === null) return null;
	const used = owner.usedMinutes;
	const state = used > minutes ? 'exceeded' : used * 5 >= minutes * 4 ? 'warn' : 'ok';
	return {
		minutes,
		usedMinutes: used,
		state,
		explanation: {
			key: `billing.budget.${state}`,
			params: { usedMinutes: used, budgetMinutes: minutes }
		}
	};
}

const asProject = (owner: MockProject): Project => ({
	id: owner.id,
	clientId: owner.clientId,
	name: owner.name,
	code: owner.code,
	billable: owner.billable,
	budget: budgetOf(owner),
	roundingIncrementMin: owner.roundingIncrementMin,
	roundingMode: owner.roundingMode,
	openToAll: owner.openToAll,
	archivedAt: owner.archivedAt
});

const fail = (status: number, code: Exclude<ErrorCode, 'VALIDATION'>, message: string) =>
	HttpResponse.json({ code, message, details: null }, { status });

const invalid = (error: ZodError) =>
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

const done = () => new HttpResponse(null, { status: 204 });
const now = () => new Date().toISOString();
const flag = (url: string, name: string) => new URL(url).searchParams.get(name) === 'true';

const findClient = (id: unknown) => store.clients.find((c) => c.id === id);
const findProject = (id: unknown) => store.projects.find((p) => p.id === id);
const findTask = (id: unknown) => store.tasks.find((t) => t.id === id);
const clientName = (id: string) => findClient(id)?.name ?? '';

const replaceClient = (next: Client) => {
	store.clients = store.clients.map((c) => (c.id === next.id ? next : c));
	return HttpResponse.json(next);
};

const replaceProject = (next: MockProject) => {
	store.projects = store.projects.map((p) => (p.id === next.id ? next : p));
	return HttpResponse.json(asProject(next));
};

const replaceTask = (next: Task) => {
	store.tasks = store.tasks.map((t) => (t.id === next.id ? next : t));
	return HttpResponse.json(next);
};

type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

// the api drops undefined keys of a patch, the spread would overwrite with them
const defined = <T extends object>(patch: T) =>
	Object.fromEntries(
		Object.entries(patch).filter(([, value]) => value !== undefined)
	) as Defined<T>;

const membersSchema = z.strictObject({ employeeIds: z.array(z.uuid()) });

export const billingHandlers = [
	http.get('/api/clients', ({ request }) => {
		const archived = flag(request.url, 'includeArchived');
		return HttpResponse.json(
			store.clients
				.filter((c) => archived || !c.archivedAt)
				.toSorted((a, b) => a.name.localeCompare(b.name, 'de'))
		);
	}),

	http.post('/api/clients', async ({ request }) => {
		const parsed = createClientSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const input = parsed.data;
		if (input.number && store.clients.some((c) => c.number === input.number)) {
			return fail(409, 'ALREADY_EXISTS', 'Client number already in use');
		}
		const created: Client = {
			...client(0, input.name),
			...defined(input),
			id: crypto.randomUUID()
		};
		store.clients.push(created);
		return HttpResponse.json(created, { status: 201 });
	}),

	http.get('/api/clients/:id', ({ params }) => {
		const found = findClient(params.id);
		return found ? HttpResponse.json(found) : fail(404, 'NOT_FOUND', 'Client not found');
	}),

	http.patch('/api/clients/:id', async ({ params, request }) => {
		const parsed = updateClientSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const found = findClient(params.id);
		if (!found) return fail(404, 'NOT_FOUND', 'Client not found');
		return replaceClient({ ...found, ...defined(parsed.data) });
	}),

	http.post('/api/clients/:id/archive', ({ params }) => {
		const found = findClient(params.id);
		if (!found) return fail(404, 'NOT_FOUND', 'Client not found');
		return replaceClient({ ...found, archivedAt: found.archivedAt ?? now() });
	}),

	// like the store: without projects and rates it goes for good, otherwise it is only locked away
	http.delete('/api/clients/:id', ({ params }) => {
		const found = findClient(params.id);
		if (!found) return fail(404, 'NOT_FOUND', 'Client not found');
		const referenced =
			store.projects.some((p) => p.clientId === found.id) ||
			store.rates.some((r) => r.clientId === found.id);
		if (referenced) {
			replaceClient({
				...found,
				archivedAt: found.archivedAt ?? now(),
				restrictedAt: found.restrictedAt ?? now()
			});
		} else {
			store.clients = store.clients.filter((c) => c.id !== found.id);
		}
		return done();
	}),

	http.get('/api/projects', ({ request }) => {
		const owner = new URL(request.url).searchParams.get('client');
		const archived = flag(request.url, 'includeArchived');
		return HttpResponse.json(
			store.projects
				.filter((p) => (owner === null || p.clientId === owner) && (archived || !p.archivedAt))
				.toSorted(
					(a, b) =>
						clientName(a.clientId).localeCompare(clientName(b.clientId), 'de') ||
						a.name.localeCompare(b.name, 'de')
				)
				.map(asProject)
		);
	}),

	http.post('/api/projects', async ({ request }) => {
		const parsed = createProjectSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const { clientId: owner, budgetMinutes, ...input } = parsed.data;
		if (!findClient(owner)) return fail(404, 'NOT_FOUND', 'Client not found');
		const created: MockProject = {
			...project(0, 0, input.name),
			...defined(input),
			id: crypto.randomUUID(),
			clientId: owner,
			budgetMinutes: budgetMinutes ?? null
		};
		store.projects.push(created);
		return HttpResponse.json(asProject(created), { status: 201 });
	}),

	http.get('/api/projects/:id', ({ params }) => {
		const found = findProject(params.id);
		return found
			? HttpResponse.json(asProject(found))
			: fail(404, 'NOT_FOUND', 'Project not found');
	}),

	http.patch('/api/projects/:id', async ({ params, request }) => {
		const parsed = updateProjectSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const found = findProject(params.id);
		if (!found) return fail(404, 'NOT_FOUND', 'Project not found');
		return replaceProject({ ...found, ...defined(parsed.data) });
	}),

	http.get('/api/projects/:id/members', ({ params }) => {
		const found = findProject(params.id);
		if (!found || world !== 'company') return fail(404, 'NOT_FOUND', 'Project not found');
		return HttpResponse.json(
			mockEmployees
				.filter((e) => found.members.includes(e.id))
				.map((e) => ({ employeeId: e.id, name: `${e.firstName} ${e.lastName}` }))
		);
	}),

	http.put('/api/projects/:id/members', async ({ params, request }) => {
		const parsed = membersSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const found = findProject(params.id);
		if (!found || world !== 'company') return fail(404, 'NOT_FOUND', 'Project not found');
		const employeeIds = [...new Set(parsed.data.employeeIds)].sort();
		store.projects = store.projects.map((p) =>
			p.id === found.id ? { ...p, members: employeeIds } : p
		);
		return HttpResponse.json({ employeeIds });
	}),

	http.get('/api/projects/:id/tasks', ({ params }) => {
		if (!findProject(params.id)) return fail(404, 'NOT_FOUND', 'Project not found');
		return HttpResponse.json(store.tasks.filter((t) => t.projectId === params.id));
	}),

	http.post('/api/projects/:id/tasks', async ({ params, request }) => {
		const parsed = createTaskSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const found = findProject(params.id);
		if (!found) return fail(404, 'NOT_FOUND', 'Project not found');
		const created: Task = {
			id: crypto.randomUUID(),
			projectId: found.id,
			name: parsed.data.name,
			billable: parsed.data.billable ?? null,
			archivedAt: null
		};
		store.tasks.push(created);
		return HttpResponse.json(created, { status: 201 });
	}),

	http.patch('/api/tasks/:id', async ({ params, request }) => {
		const parsed = updateTaskSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const found = findTask(params.id);
		if (!found) return fail(404, 'NOT_FOUND', 'Task not found');
		return replaceTask({ ...found, ...defined(parsed.data) });
	}),

	http.post('/api/tasks/:id/archive', ({ params }) => {
		const found = findTask(params.id);
		if (!found) return fail(404, 'NOT_FOUND', 'Task not found');
		return replaceTask({ ...found, archivedAt: found.archivedAt ?? now() });
	}),

	http.get('/api/rates', ({ request }) => {
		const search = new URL(request.url).searchParams;
		const matches = (value: string | null, key: string) => {
			const wanted = search.get(key);
			return wanted === null || value === wanted;
		};
		return HttpResponse.json(
			store.rates
				.filter(
					(r) =>
						matches(r.clientId, 'client') &&
						matches(r.projectId, 'project') &&
						matches(r.employeeId, 'employee')
				)
				.toSorted((a, b) => b.validFrom.localeCompare(a.validFrom))
		);
	}),

	http.post('/api/rates', async ({ request }) => {
		const parsed = createRateSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const input = parsed.data;
		const created: Rate = {
			id: crypto.randomUUID(),
			clientId: input.clientId ?? null,
			projectId: input.projectId ?? null,
			taskId: input.taskId ?? null,
			employeeId: input.employeeId ?? null,
			validFrom: input.validFrom,
			rateCents: input.rateCents,
			createdBy: mockSession.user.id
		};
		const same = (r: Rate) =>
			r.clientId === created.clientId &&
			r.projectId === created.projectId &&
			r.taskId === created.taskId &&
			r.employeeId === created.employeeId &&
			r.validFrom === created.validFrom;
		if (store.rates.some(same)) return fail(409, 'ALREADY_EXISTS', 'A rate for this day exists');
		store.rates.push(created);
		return HttpResponse.json(created, { status: 201 });
	}),

	http.delete('/api/rates/:id', ({ params }) => {
		const found = store.rates.find((r) => r.id === params.id);
		if (!found) return fail(404, 'NOT_FOUND', 'Rate not found');
		if (found.validFrom <= todayIso()) {
			return HttpResponse.json(
				{
					code: 'INVALID_STATE',
					message: 'Only a rate that has not taken effect yet can be removed',
					details: { field: 'validFrom', message: 'rate.futureOnly' }
				},
				{ status: 409 }
			);
		}
		store.rates = store.rates.filter((r) => r.id !== found.id);
		return done();
	})
];
