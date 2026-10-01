import { randomUUID } from 'node:crypto';
import { RequestMethod, type INestApplication, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { roles, type Role, type WorkspaceKind } from '@zeit/shared';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLE } from '../../src/common/roles.guard';
import { IS_PUBLIC } from '../../src/common/session.guard';
import { WORKSPACE } from '../../src/common/workspace.guard';
import { DemoController } from '../../src/demo/demo.controller';
import { startApi, type Api, type Browser } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { createPerson, createTenant, createUser } from '../helpers/pg';
import { createClient, createProject } from '../projects/books';

// signed-in: neither @Roles nor @Public, only the session guard stands in front
type Access = Role | 'public' | 'signed-in';
type Reach = 'company' | 'both';

// a key written twice does not compile, so every route has exactly one line
const expected: Record<string, Access> = {
	'GET /health': 'public',
	'GET /config': 'public',

	'POST /auth/login': 'public',
	'POST /auth/password/forgot': 'public',
	'POST /auth/password/reset': 'public',
	'POST /auth/invitations/inspect': 'public',
	'POST /auth/invitations/accept': 'public',
	'POST /auth/mfa/totp': 'public',
	'POST /auth/mfa/recovery': 'public',
	'POST /auth/mfa/passkey/options': 'public',
	'POST /auth/passkey/options': 'public',
	'POST /auth/mfa/passkey': 'public',
	'POST /auth/passkey/verify': 'public',
	'GET /auth/session': 'signed-in',
	'POST /auth/logout': 'signed-in',
	'POST /auth/password/change': 'signed-in',
	'GET /auth/sessions': 'signed-in',
	'DELETE /auth/sessions/:id': 'signed-in',
	'POST /auth/reauth': 'signed-in',
	'POST /auth/reauth/passkey/options': 'signed-in',
	'POST /auth/reauth/passkey': 'signed-in',

	'GET /security': 'signed-in',
	'POST /security/totp/setup': 'signed-in',
	'POST /security/totp/confirm': 'signed-in',
	'DELETE /security/totp': 'signed-in',
	'POST /security/passkeys/options': 'signed-in',
	'POST /security/passkeys': 'signed-in',
	'PATCH /security/passkeys/:id': 'signed-in',
	'DELETE /security/passkeys/:id': 'signed-in',
	'POST /security/recovery-codes': 'signed-in',

	'GET /me': 'employee',
	'PATCH /me': 'employee',

	'GET /clock': 'employee',
	'POST /clock/in': 'employee',
	'POST /clock/break': 'employee',
	'POST /clock/resume': 'employee',
	'POST /clock/out': 'employee',

	'GET /employees/:id/entries': 'employee',
	'GET /employees/:id/days': 'employee',
	'GET /employees/:id/flex': 'employee',

	'POST /corrections': 'employee',
	'GET /corrections': 'employee',
	'POST /corrections/:id/approve': 'team_lead',
	'POST /corrections/:id/reject': 'team_lead',
	'POST /corrections/:id/withdraw': 'employee',

	'POST /absences/preview': 'signed-in',
	'POST /absences': 'signed-in',
	'GET /absences': 'signed-in',
	'POST /absences/:id/approve': 'team_lead',
	'POST /absences/:id/reject': 'team_lead',
	'POST /absences/:id/withdraw': 'signed-in',
	'POST /absences/:id/cancel': 'signed-in',
	'POST /absences/:id/confirm-sick-note': 'hr',
	'GET /team-calendar': 'signed-in',

	'GET /employees/:id/vacation': 'signed-in',
	'POST /employees/:id/vacation/adjustments': 'hr',
	'POST /vacation/notices': 'hr',
	'GET /vacation/notices': 'signed-in',
	'POST /me/vacation/notices/:id/acknowledge': 'signed-in',

	'POST /employees/:id/flex/bookings': 'hr',

	'GET /project-timer': 'employee',
	'POST /project-timer/start': 'employee',
	'POST /project-timer/stop': 'employee',
	'GET /employees/:id/project-entries': 'employee',
	'POST /project-entries': 'employee',
	'PATCH /project-entries/:id': 'employee',
	'POST /project-entries/:id/void': 'employee',
	'GET /employees/:id/project-week': 'employee',
	'GET /project-time/summary': 'team_lead',
	'GET /clients': 'hr',
	'POST /clients': 'hr',
	'GET /clients/:id': 'hr',
	'PATCH /clients/:id': 'hr',
	'POST /clients/:id/archive': 'hr',
	'DELETE /clients/:id': 'admin',
	'GET /projects/bookable': 'employee',
	'GET /projects/budgets': 'hr',
	'GET /projects': 'hr',
	'POST /projects': 'hr',
	'GET /projects/:id': 'hr',
	'PATCH /projects/:id': 'hr',
	'POST /projects/:id/archive': 'hr',
	'GET /projects/:id/members': 'hr',
	'PUT /projects/:id/members': 'hr',
	'GET /projects/:id/tasks': 'hr',
	'POST /projects/:id/tasks': 'hr',
	'PATCH /tasks/:id': 'hr',
	'POST /tasks/:id/archive': 'hr',
	'GET /rates': 'hr',
	'POST /rates': 'hr',
	'DELETE /rates/:id': 'hr',

	'GET /billing/profile': 'hr',
	'PATCH /billing/profile': 'admin',
	'GET /billing/unbilled': 'hr',
	'GET /billing/revenue': 'hr',

	'GET /invoices': 'hr',
	'POST /invoices/drafts': 'hr',
	'GET /invoices/:id': 'hr',
	'PATCH /invoices/:id': 'hr',
	'DELETE /invoices/:id': 'hr',
	'POST /invoices/:id/refresh': 'hr',
	'POST /invoices/:id/lines': 'hr',
	'PATCH /invoices/:id/lines/:lineId': 'hr',
	'DELETE /invoices/:id/lines/:lineId': 'hr',
	'GET /invoices/:id/preview.pdf': 'hr',
	'POST /invoices/:id/issue': 'hr',
	'POST /invoices/:id/cancel': 'hr',
	'POST /invoices/:id/paid': 'hr',
	'POST /invoices/:id/unpaid': 'hr',
	'GET /invoices/:id/document': 'hr',
	'GET /invoices/:id/time-report': 'hr',

	'GET /compliance/findings': 'team_lead',
	'POST /compliance/findings/ack': 'team_lead',
	'GET /compliance/rule-versions': 'employee',

	'GET /employees': 'hr',
	'POST /employees': 'hr',
	'GET /employees/:id': 'employee',
	'PATCH /employees/:id': 'hr',
	'POST /employees/:id/exit': 'hr',
	'GET /employees/:id/contracts': 'hr',
	'POST /employees/:id/contracts': 'hr',
	'DELETE /employees/:id/contracts/:cid': 'hr',
	'GET /work-models': 'hr',
	'POST /work-models': 'hr',
	'PATCH /work-models/:id': 'hr',
	'GET /teams': 'hr',
	'POST /teams': 'hr',
	'PATCH /teams/:id': 'hr',
	'PUT /teams/:id/leads': 'hr',

	'GET /users': 'admin',
	'POST /users': 'admin',
	'POST /users/:id/invite': 'admin',
	'PATCH /users/:id': 'admin',
	'POST /users/:id/disable': 'admin',
	'POST /users/:id/enable': 'admin',
	'POST /users/:id/mfa/reset': 'admin',

	'GET /months/:month/checklist': 'hr',
	'POST /months/:month/close': 'hr',
	'POST /months/:month/reopen': 'admin',

	'GET /exports/timesheet': 'employee',
	'GET /exports/month-overview': 'hr',
	'GET /exports/time-report': 'hr',

	'GET /tenant': 'employee',
	'PATCH /tenant': 'admin',
	'GET /holidays': 'employee',

	'GET /audit': 'employee',

	'POST /demo/sandboxes': 'public',
	'GET /demo/personas': 'signed-in',
	'POST /demo/switch': 'signed-in',
	'GET /demo/outbox': 'signed-in'
};

// company: a solo workspace gets the 404 of an unknown route, both: served in either workspace
const expectedWorkspace: Record<string, Reach> = {
	'GET /health': 'both',
	'GET /config': 'both',

	'POST /auth/login': 'both',
	'POST /auth/password/forgot': 'both',
	'POST /auth/password/reset': 'both',
	'POST /auth/invitations/inspect': 'both',
	'POST /auth/invitations/accept': 'both',
	'POST /auth/mfa/totp': 'both',
	'POST /auth/mfa/recovery': 'both',
	'POST /auth/mfa/passkey/options': 'both',
	'POST /auth/passkey/options': 'both',
	'POST /auth/mfa/passkey': 'both',
	'POST /auth/passkey/verify': 'both',
	'GET /auth/session': 'both',
	'POST /auth/logout': 'both',
	'POST /auth/password/change': 'both',
	'GET /auth/sessions': 'both',
	'DELETE /auth/sessions/:id': 'both',
	'POST /auth/reauth': 'both',
	'POST /auth/reauth/passkey/options': 'both',
	'POST /auth/reauth/passkey': 'both',

	'GET /security': 'both',
	'POST /security/totp/setup': 'both',
	'POST /security/totp/confirm': 'both',
	'DELETE /security/totp': 'both',
	'POST /security/passkeys/options': 'both',
	'POST /security/passkeys': 'both',
	'PATCH /security/passkeys/:id': 'both',
	'DELETE /security/passkeys/:id': 'both',
	'POST /security/recovery-codes': 'both',

	'GET /me': 'both',
	'PATCH /me': 'both',

	'GET /clock': 'company',
	'POST /clock/in': 'company',
	'POST /clock/break': 'company',
	'POST /clock/resume': 'company',
	'POST /clock/out': 'company',

	'GET /employees/:id/entries': 'company',
	'GET /employees/:id/days': 'company',
	'GET /employees/:id/flex': 'company',

	'POST /corrections': 'company',
	'GET /corrections': 'company',
	'POST /corrections/:id/approve': 'company',
	'POST /corrections/:id/reject': 'company',
	'POST /corrections/:id/withdraw': 'company',

	'POST /absences/preview': 'company',
	'POST /absences': 'company',
	'GET /absences': 'company',
	'POST /absences/:id/approve': 'company',
	'POST /absences/:id/reject': 'company',
	'POST /absences/:id/withdraw': 'company',
	'POST /absences/:id/cancel': 'company',
	'POST /absences/:id/confirm-sick-note': 'company',
	'GET /team-calendar': 'company',

	'GET /employees/:id/vacation': 'company',
	'POST /employees/:id/vacation/adjustments': 'company',
	'POST /vacation/notices': 'company',
	'GET /vacation/notices': 'company',
	'POST /me/vacation/notices/:id/acknowledge': 'company',

	'POST /employees/:id/flex/bookings': 'company',

	'GET /project-timer': 'both',
	'POST /project-timer/start': 'both',
	'POST /project-timer/stop': 'both',
	'GET /employees/:id/project-entries': 'both',
	'POST /project-entries': 'both',
	'PATCH /project-entries/:id': 'both',
	'POST /project-entries/:id/void': 'both',
	'GET /employees/:id/project-week': 'both',
	'GET /project-time/summary': 'company',
	'GET /clients': 'both',
	'POST /clients': 'both',
	'GET /clients/:id': 'both',
	'PATCH /clients/:id': 'both',
	'POST /clients/:id/archive': 'both',
	'DELETE /clients/:id': 'both',
	'GET /projects/bookable': 'both',
	'GET /projects/budgets': 'both',
	'GET /projects': 'both',
	'POST /projects': 'both',
	'GET /projects/:id': 'both',
	'PATCH /projects/:id': 'both',
	'POST /projects/:id/archive': 'both',
	'GET /projects/:id/members': 'company',
	'PUT /projects/:id/members': 'company',
	'GET /projects/:id/tasks': 'both',
	'POST /projects/:id/tasks': 'both',
	'PATCH /tasks/:id': 'both',
	'POST /tasks/:id/archive': 'both',
	'GET /rates': 'both',
	'POST /rates': 'both',
	'DELETE /rates/:id': 'both',

	'GET /billing/profile': 'both',
	'PATCH /billing/profile': 'both',
	'GET /billing/unbilled': 'both',
	'GET /billing/revenue': 'both',

	'GET /invoices': 'both',
	'POST /invoices/drafts': 'both',
	'GET /invoices/:id': 'both',
	'PATCH /invoices/:id': 'both',
	'DELETE /invoices/:id': 'both',
	'POST /invoices/:id/refresh': 'both',
	'POST /invoices/:id/lines': 'both',
	'PATCH /invoices/:id/lines/:lineId': 'both',
	'DELETE /invoices/:id/lines/:lineId': 'both',
	'GET /invoices/:id/preview.pdf': 'both',
	'POST /invoices/:id/issue': 'both',
	'POST /invoices/:id/cancel': 'both',
	'POST /invoices/:id/paid': 'both',
	'POST /invoices/:id/unpaid': 'both',
	'GET /invoices/:id/document': 'both',
	'GET /invoices/:id/time-report': 'both',

	'GET /compliance/findings': 'company',
	'POST /compliance/findings/ack': 'company',
	'GET /compliance/rule-versions': 'company',

	'GET /employees': 'company',
	'POST /employees': 'company',
	'GET /employees/:id': 'company',
	'PATCH /employees/:id': 'company',
	'POST /employees/:id/exit': 'company',
	'GET /employees/:id/contracts': 'company',
	'POST /employees/:id/contracts': 'company',
	'DELETE /employees/:id/contracts/:cid': 'company',
	'GET /work-models': 'company',
	'POST /work-models': 'company',
	'PATCH /work-models/:id': 'company',
	'GET /teams': 'company',
	'POST /teams': 'company',
	'PATCH /teams/:id': 'company',
	'PUT /teams/:id/leads': 'company',

	'GET /users': 'both',
	'POST /users': 'company',
	'POST /users/:id/invite': 'company',
	'PATCH /users/:id': 'both',
	'POST /users/:id/disable': 'both',
	'POST /users/:id/enable': 'both',
	'POST /users/:id/mfa/reset': 'both',

	'GET /months/:month/checklist': 'company',
	'POST /months/:month/close': 'company',
	'POST /months/:month/reopen': 'company',

	'GET /exports/timesheet': 'company',
	'GET /exports/month-overview': 'company',
	'GET /exports/time-report': 'both',

	'GET /tenant': 'both',
	'PATCH /tenant': 'both',
	'GET /holidays': 'both',

	'GET /audit': 'both',

	'POST /demo/sandboxes': 'both',
	'GET /demo/personas': 'both',
	'POST /demo/switch': 'both',
	'GET /demo/outbox': 'both'
};

const routePath = (...parts: string[]) =>
	'/' +
	parts
		.flatMap((part) => part.split('/'))
		.filter(Boolean)
		.join('/');

// the walk nest's router explorer makes: every controller of every module, every routed method
function registeredRoutes(app: INestApplication, ...unmounted: Type[]) {
	const reflector = app.get(Reflector);
	const scanner = new MetadataScanner();
	const routes: [route: string, access: Access, reach: Reach][] = [];
	const mounted = [...app.get(ModulesContainer).values()]
		.flatMap((module) => [...module.controllers.values()])
		.map(({ metatype }) => metatype as Type);

	for (const controller of [...mounted, ...unmounted]) {
		for (const name of scanner.getAllMethodNames(controller.prototype)) {
			const handler = controller.prototype[name];
			const paths = Reflect.getMetadata(PATH_METADATA, handler);
			if (paths === undefined) continue;

			const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
			const targets = [handler, controller];
			// the roles guard asks for a session even under @Public, so a role wins
			const access =
				reflector.getAllAndOverride<Role | undefined>(ROLE, targets) ??
				(reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets)
					? 'public'
					: 'signed-in');
			const reach =
				reflector.getAllAndOverride<WorkspaceKind | undefined>(WORKSPACE, targets) === 'company'
					? 'company'
					: 'both';

			for (const prefix of [Reflect.getMetadata(PATH_METADATA, controller)].flat()) {
				for (const path of [paths].flat()) {
					routes.push([`${method} ${routePath(prefix, path)}`, access, reach]);
				}
			}
		}
	}
	return routes;
}

let api: Api;
let routes: [route: string, access: Access, reach: Reach][];

beforeAll(async () => {
	api = await startApi();
	// the demo module is only mounted on the demo instance, its access is read from the controller
	routes = registeredRoutes(api.app, DemoController);
});

afterAll(() => api.app.close());

describe('role matrix', () => {
	it('has a line for every registered route', () => {
		const unlisted = routes.filter(([route]) => !Object.hasOwn(expected, route));
		expect(unlisted).toEqual([]);
	});

	it('has no line for a route that is gone', () => {
		const served = new Set(routes.map(([route]) => route));
		expect(Object.keys(expected).filter((route) => !served.has(route))).toEqual([]);
	});

	it('finds on every route the access the table expects', () => {
		const drifted = routes
			.filter(([route, access]) => Object.hasOwn(expected, route) && expected[route] !== access)
			.map(([route, access]) => `${route} is ${access}, the table says ${expected[route]}`);
		expect(drifted).toEqual([]);
	});

	it('registers no route twice', () => {
		const keys = routes.map(([route]) => route);
		expect(keys.filter((route, i) => keys.indexOf(route) !== i)).toEqual([]);
	});

	it('has a workspace line for every registered route', () => {
		const unlisted = routes.filter(([route]) => !Object.hasOwn(expectedWorkspace, route));
		expect(unlisted).toEqual([]);
	});

	it('has no workspace line for a route that is gone', () => {
		const served = new Set(routes.map(([route]) => route));
		expect(Object.keys(expectedWorkspace).filter((route) => !served.has(route))).toEqual([]);
	});

	it('finds on every route the workspace the table expects', () => {
		const drifted = routes
			.filter(
				([route, , reach]) =>
					Object.hasOwn(expectedWorkspace, route) && expectedWorkspace[route] !== reach
			)
			.map(
				([route, , reach]) => `${route} is ${reach}, the table says ${expectedWorkspace[route]}`
			);
		expect(drifted).toEqual([]);
	});

	it('keeps both tables on the same routes', () => {
		expect(Object.keys(expectedWorkspace)).toEqual(Object.keys(expected));
	});
});

describe('roles guard', () => {
	const desks = {} as Record<Role, Desk>;

	beforeAll(async () => {
		const tenant = await createTenant();
		for (const role of roles) {
			const { userId } = await createUser(tenant, { role });
			desks[role] = await signedIn(api, userId);
		}
	});

	// one rung below the table in five modules; the guard answers before any pipe looks at an id
	const probes: { route: string; below: Role; send: (desk: Desk) => request.Test }[] = [
		{ route: 'GET /employees', below: 'employee', send: (desk) => desk.get('/employees') },
		{
			route: 'POST /absences/:id/approve',
			below: 'employee',
			send: (desk) => desk.post(`/absences/${randomUUID()}/approve`)
		},
		{
			route: 'GET /exports/month-overview',
			below: 'team_lead',
			send: (desk) => desk.get('/exports/month-overview?month=2026-08')
		},
		{ route: 'PATCH /tenant', below: 'team_lead', send: (desk) => desk.patch('/tenant') },
		{
			route: 'POST /months/:month/reopen',
			below: 'hr',
			send: (desk) => desk.post('/months/2026-08/reopen')
		},
		{ route: 'GET /projects', below: 'team_lead', send: (desk) => desk.get('/projects') },
		{ route: 'GET /rates', below: 'team_lead', send: (desk) => desk.get('/rates') },
		{
			route: 'DELETE /clients/:id',
			below: 'hr',
			send: (desk) => desk.delete(`/clients/${randomUUID()}`)
		},
		{ route: 'GET /invoices', below: 'team_lead', send: (desk) => desk.get('/invoices') },
		{
			route: 'PATCH /billing/profile',
			below: 'hr',
			send: (desk) => desk.patch('/billing/profile')
		}
	];

	it.each(probes)('turns $below away from $route', async ({ below, send }) => {
		const answer = await send(desks[below]);
		expect(answer.status).toBe(403);
		expect(answer.body).toEqual({
			code: 'FORBIDDEN',
			message: 'Not allowed for your role',
			details: null
		});
	});

	it.each(probes)('lets the role from the table past the guard on $route', async (probe) => {
		const answer = await probe.send(desks[expected[probe.route] as Role]);
		expect(answer.body.message).not.toBe('Not allowed for your role');
	});

	// clients, projects and rates are closed to employees in the database as well
	it('keeps the project list from an employee', async () => {
		const answer = await desks.employee.get('/projects');
		expect(answer.status).toBe(403);
		expect(answer.body.code).toBe('FORBIDDEN');
	});
});

describe('project time summary', () => {
	it('carries minutes and never an amount, not even for hr', async () => {
		const tenant = await createTenant();
		const worker = await createPerson(tenant);
		const hr = await createPerson(tenant, { role: 'hr' });
		const client = await createClient(api.superuser, tenant);
		const project = await createProject(api.superuser, tenant, client);
		await api.superuser.query(
			`insert into app.rates (tenant_id, client_id, valid_from, rate_cents) values ($1, $2, '2026-01-01', 9000)`,
			[tenant, client]
		);
		await (
			await signedIn(api, worker.userId)
		).post('/project-entries', {
			projectId: project,
			startedAt: '2026-09-22T09:00:00+02:00',
			endedAt: '2026-09-22T11:00:00+02:00',
			note: 'Startseite'
		});

		const answer = await (
			await signedIn(api, hr.userId)
		).get('/project-time/summary?from=2026-09-21&to=2026-09-27');
		expect(answer.status).toBe(200);
		expect(answer.body).toHaveLength(1);
		expect(answer.body[0]).not.toHaveProperty('amountCents');
		expect(JSON.stringify(answer.body)).not.toMatch(/amount|9000/);
	});
});

// this instance runs in test mode, test/demo covers the routes on the demo instance
describe('demo routes outside the demo', () => {
	let persona: Desk;

	beforeAll(async () => {
		const sandbox = await createTenant({ kind: 'sandbox' });
		const { userId } = await createUser(sandbox, { status: 'demo' });
		persona = await signedIn(api, userId);
	});

	const demoRoutes: { route: string; send: (client: Desk | Browser) => request.Test }[] = [
		{
			route: 'POST /demo/sandboxes',
			send: (client) => client.post('/demo/sandboxes', { locale: 'de' })
		},
		{ route: 'GET /demo/personas', send: (client) => client.get('/demo/personas') },
		{
			route: 'POST /demo/switch',
			send: (client) => client.post('/demo/switch', { userId: randomUUID() })
		},
		{ route: 'GET /demo/outbox', send: (client) => client.get('/demo/outbox') }
	];

	it.each(demoRoutes)('answers 404 on $route even for a sandbox persona', async ({ send }) => {
		expect((await send(persona)).status).toBe(404);
	});

	// without the module nest does not know the routes, no guard gets to answer 401 first
	it.each(demoRoutes)('serves nothing on $route without a session', async ({ send }) => {
		expect((await send(api.browser())).status).toBe(404);
	});
});

describe('workspace guard', () => {
	let solo: Desk;
	let company: Desk;

	beforeAll(async () => {
		const freelancer = await createPerson(await createTenant({ workspace: 'solo' }), {
			role: 'admin'
		});
		const owner = await createPerson(await createTenant(), { role: 'admin' });
		solo = await signedIn(api, freelancer.userId);
		company = await signedIn(api, owner.userId);
	});

	// what nest answers for a route it does not know, through the same exception filter
	const unknownRoute = (method: string, path: string) => ({
		code: 'NOT_FOUND',
		message: `Cannot ${method} /api${path}`,
		details: null
	});

	// at least one route of every module that carries @Workspace('company')
	const probes: { route: string; path: string }[] = [
		{ route: 'GET /clock', path: '/clock' },
		{ route: 'GET /employees/:id/entries', path: `/employees/${randomUUID()}/entries` },
		{ route: 'POST /corrections', path: '/corrections' },
		{ route: 'GET /absences', path: '/absences' },
		{ route: 'GET /team-calendar', path: '/team-calendar' },
		{ route: 'GET /employees/:id/vacation', path: `/employees/${randomUUID()}/vacation` },
		{
			route: 'POST /employees/:id/flex/bookings',
			path: `/employees/${randomUUID()}/flex/bookings`
		},
		{ route: 'GET /compliance/findings', path: '/compliance/findings' },
		{ route: 'GET /employees', path: '/employees' },
		{ route: 'GET /teams', path: '/teams' },
		{ route: 'GET /work-models', path: '/work-models' },
		{ route: 'GET /months/:month/checklist', path: '/months/2026-08/checklist' },
		{ route: 'GET /exports/timesheet', path: '/exports/timesheet?month=2026-08' },
		{ route: 'GET /exports/month-overview', path: '/exports/month-overview?month=2026-08' },
		{ route: 'POST /users', path: '/users' },
		{ route: 'POST /users/:id/invite', path: `/users/${randomUUID()}/invite` },
		{
			route: 'GET /project-time/summary',
			path: '/project-time/summary?from=2026-09-21&to=2026-09-27'
		}
	];

	const send = (desk: Desk, route: string, path: string) =>
		route.startsWith('GET ') ? desk.get(path) : desk.post(path);

	it('answers an unknown route with the plain not found body', async () => {
		const answer = await solo.get('/nirgends');
		expect(answer.status).toBe(404);
		expect(answer.body).toEqual(unknownRoute('GET', '/nirgends'));
	});

	it.each(probes)(
		'hides $route from a solo workspace like an unknown route',
		async ({ route, path }) => {
			expect(expectedWorkspace[route]).toBe('company');
			const answer = await send(solo, route, path);
			expect(answer.status).toBe(404);
			expect(answer.body).toEqual(unknownRoute(route.split(' ')[0]!, path));
		}
	);

	it.each(probes)('lets a company past the guard on $route', async ({ route, path }) => {
		const answer = await send(company, route, path);
		expect(answer.body).not.toEqual(unknownRoute(route.split(' ')[0]!, path));
	});

	it('still serves the tenant and the session to a solo workspace', async () => {
		const tenant = await solo.get('/tenant');
		expect(tenant.status).toBe(200);
		expect(tenant.body.workspace).toBe('solo');

		const session = await solo.get('/auth/session');
		expect(session.status).toBe(200);
		expect(session.body.tenant.workspace).toBe('solo');
	});
});
