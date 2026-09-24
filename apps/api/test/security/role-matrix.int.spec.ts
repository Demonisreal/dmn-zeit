import { randomUUID } from 'node:crypto';
import { RequestMethod, type INestApplication, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { roles, type Role } from '@zeit/shared';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLE } from '../../src/common/roles.guard';
import { IS_PUBLIC } from '../../src/common/session.guard';
import { startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { createTenant, createUser } from '../helpers/pg';

// signed-in: neither @Roles nor @Public, only the session guard stands in front
type Access = Role | 'public' | 'signed-in';

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

	'GET /tenant': 'employee',
	'PATCH /tenant': 'admin',
	'GET /holidays': 'employee',

	'GET /audit': 'employee'
};

const routePath = (...parts: string[]) =>
	'/' +
	parts
		.flatMap((part) => part.split('/'))
		.filter(Boolean)
		.join('/');

// the walk nest's router explorer makes: every controller of every module, every routed method
function registeredRoutes(app: INestApplication) {
	const reflector = app.get(Reflector);
	const scanner = new MetadataScanner();
	const routes: [route: string, access: Access][] = [];

	for (const module of app.get(ModulesContainer).values()) {
		for (const { metatype } of module.controllers.values()) {
			const controller = metatype as Type;
			for (const name of scanner.getAllMethodNames(controller.prototype)) {
				const handler = controller.prototype[name];
				const paths = Reflect.getMetadata(PATH_METADATA, handler);
				if (paths === undefined) continue;

				const method =
					RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
				const targets = [handler, controller];
				// the roles guard asks for a session even under @Public, so a role wins
				const access =
					reflector.getAllAndOverride<Role | undefined>(ROLE, targets) ??
					(reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets)
						? 'public'
						: 'signed-in');

				for (const prefix of [Reflect.getMetadata(PATH_METADATA, controller)].flat()) {
					for (const path of [paths].flat()) {
						routes.push([`${method} ${routePath(prefix, path)}`, access]);
					}
				}
			}
		}
	}
	return routes;
}

let api: Api;
let routes: [route: string, access: Access][];

beforeAll(async () => {
	api = await startApi();
	routes = registeredRoutes(api.app);
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
});
