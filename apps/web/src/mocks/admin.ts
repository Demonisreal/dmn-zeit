import {
	createUserSchema,
	updateTenantSchema,
	updateUserSchema,
	type ErrorCode,
	type Holiday,
	type Role,
	type Tenant,
	type User
} from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import type { ZodError } from 'zod';
import { mockSession } from './session';
import { holidaysNw, mockEmployees } from './hr';

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

const roleOf: Record<string, Role> = {
	Lenz: 'admin',
	Kortmann: 'hr',
	Hölscher: 'team_lead',
	Oberdiek: 'team_lead',
	Wiegand: 'team_lead'
};

const email = (first: string, last: string) =>
	`${first}.${last}@example.com`
		.toLowerCase()
		.replace('ö', 'oe')
		.replace('ä', 'ae')
		.replace('ı', 'i');

const seedUsers = (): User[] => [
	...mockEmployees
		.filter((employee) => employee.userId !== null)
		.map((employee, i): User => ({
			id: employee.userId!,
			email: email(employee.firstName, employee.lastName),
			displayName: `${employee.firstName} ${employee.lastName}`,
			role: roleOf[employee.lastName] ?? 'employee',
			locale: employee.lastName === 'Demir' ? 'en' : 'de',
			status: employee.lastName === 'Hagedorn' ? 'invited' : 'active',
			employeeId: employee.id,
			lastLoginAt:
				employee.lastName === 'Hagedorn'
					? null
					: `2026-09-${String(23 - (i % 9)).padStart(2, '0')}T0${7 + (i % 3)}:4${i % 10}:00+02:00`
		})),
	{
		id: '5445a1e7-7f44-4532-b25e-03a72a210dad',
		email: 'lohn@steuerkanzlei-beispiel.example',
		displayName: 'Externe Lohnprüfung',
		role: 'hr',
		locale: 'de',
		status: 'disabled',
		employeeId: null,
		lastLoginAt: '2026-03-12T10:05:00+01:00'
	}
];

const seedTenant = (): Tenant => ({
	id: mockSession.tenant.id,
	name: mockSession.tenant.name,
	slug: 'musterbetrieb',
	state: 'NW',
	timezone: 'Europe/Berlin',
	holidayOptions: [],
	halfDaysDec24And31: true,
	flexCapPlusMinutes: 2400,
	flexCapMinusMinutes: 600,
	flexCapMode: 'forfeit_at_close',
	carryoverUntil: '03-31',
	kind: 'live',
	workspace: 'company',
	expiresAt: null
});

let users = seedUsers();
let tenant = seedTenant();

export const resetMockAdmin = () => {
	users = seedUsers();
	tenant = seedTenant();
};

const findUser = (id: unknown) => users.find((user) => user.id === id);

function holidaysOf(year: number): Holiday[] {
	const local: Holiday[] = tenant.holidayOptions.includes('assumption_day')
		? [{ date: `${year}-08-15`, code: 'assumption_day', portion: 1 }]
		: [];
	return [...holidaysNw, ...local]
		.filter((holiday) => holiday.date.startsWith(String(year)))
		.filter((holiday) => tenant.halfDaysDec24And31 || holiday.portion === 1)
		.sort((a, b) => a.date.localeCompare(b.date));
}

export const adminHandlers = [
	http.get('/api/users', () => HttpResponse.json(users)),

	http.post('/api/users', async ({ request }) => {
		const parsed = createUserSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		if (users.some((user) => user.email === parsed.data.email)) {
			return fail(409, 'ALREADY_EXISTS', 'Email taken');
		}
		const created: User = {
			...parsed.data,
			id: crypto.randomUUID(),
			status: 'invited',
			lastLoginAt: null
		};
		users.push(created);
		return HttpResponse.json(created, { status: 201 });
	}),

	http.post('/api/users/:id/invite', ({ params }) => {
		const user = findUser(params.id);
		if (!user) return fail(404, 'NOT_FOUND', 'User not found');
		if (user.status !== 'invited') return fail(409, 'INVALID_STATE', 'User already active');
		return done();
	}),

	http.patch('/api/users/:id', async ({ params, request }) => {
		const user = findUser(params.id);
		if (!user) return fail(404, 'NOT_FOUND', 'User not found');
		const parsed = updateUserSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		Object.assign(user, parsed.data);
		return HttpResponse.json(user);
	}),

	http.post('/api/users/:id/disable', ({ params }) => {
		const user = findUser(params.id);
		if (!user) return fail(404, 'NOT_FOUND', 'User not found');
		user.status = 'disabled';
		return HttpResponse.json(user);
	}),

	http.post('/api/users/:id/enable', ({ params }) => {
		const user = findUser(params.id);
		if (!user) return fail(404, 'NOT_FOUND', 'User not found');
		user.status = user.lastLoginAt ? 'active' : 'invited';
		return HttpResponse.json(user);
	}),

	http.post('/api/users/:id/mfa/reset', ({ params }) =>
		findUser(params.id) ? done() : fail(404, 'NOT_FOUND', 'User not found')
	),

	http.get('/api/tenant', () => HttpResponse.json(tenant)),

	http.patch('/api/tenant', async ({ request }) => {
		const parsed = updateTenantSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		Object.assign(tenant, parsed.data);
		return HttpResponse.json(tenant);
	}),

	http.get('/api/holidays', ({ request }) => {
		const year = Number(new URL(request.url).searchParams.get('year'));
		return HttpResponse.json(holidaysOf(year));
	})
];
