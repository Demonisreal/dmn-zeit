import { holidaySchema, tenantSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api } from '../auth/api';
import { signedIn } from '../helpers/desk';
import { createPerson, createTenant, createUser } from '../helpers/pg';

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(() => api.app.close());

async function staff() {
	const tenant = await createTenant();
	return {
		tenant,
		admin: await signedIn(api, (await createUser(tenant, { role: 'admin' })).userId),
		hr: await signedIn(api, (await createUser(tenant, { role: 'hr' })).userId),
		employee: await signedIn(api, (await createPerson(tenant)).userId)
	};
}

describe('GET /api/tenant', () => {
	it('shows everyone the own tenant', async () => {
		const { tenant, employee } = await staff();
		await createTenant();
		const answer = await employee.get('/tenant');
		expect(answer.status).toBe(200);
		expect(tenantSchema.safeParse(answer.body).success).toBe(true);
		expect(answer.body).toMatchObject({
			id: tenant,
			name: 'Steuerbüro Beispiel',
			state: 'NW',
			timezone: 'Europe/Berlin',
			holidayOptions: [],
			carryoverUntil: '03-31',
			kind: 'live',
			expiresAt: null
		});
	});

	it('answers 401 without a session', async () => {
		const { employee } = await staff();
		await employee.post('/auth/logout');
		expect((await employee.get('/tenant')).status).toBe(401);
	});
});

describe('PATCH /api/tenant', () => {
	it('lets the admin change the settings', async () => {
		const { admin } = await staff();
		const answer = await admin.patch('/tenant', {
			name: ' Kanzlei Muster ',
			state: 'BY',
			holidayOptions: ['assumption_day'],
			halfDaysDec24And31: true,
			flexCapPlusMinutes: 2400,
			flexCapMode: 'warn',
			carryoverUntil: '06-30'
		});
		expect(answer.status).toBe(200);
		expect(answer.body).toMatchObject({
			name: 'Kanzlei Muster',
			state: 'BY',
			holidayOptions: ['assumption_day'],
			halfDaysDec24And31: true,
			flexCapPlusMinutes: 2400,
			flexCapMinusMinutes: null,
			flexCapMode: 'warn',
			carryoverUntil: '06-30'
		});
		expect((await admin.patch('/tenant', {})).body).toEqual(answer.body);
	});

	it('ignores kind, slug and expiry', async () => {
		const { admin } = await staff();
		const before = (await admin.get('/tenant')).body;
		const answer = await admin.patch('/tenant', {
			kind: 'sandbox',
			slug: 'woanders',
			expiresAt: '2030-01-01T00:00:00Z'
		});
		expect(answer.status).toBe(200);
		expect(answer.body).toEqual(before);
	});

	it('checks the body', async () => {
		const { admin } = await staff();
		expect((await admin.patch('/tenant', { carryoverUntil: '02-29' })).status).toBe(400);
		expect((await admin.patch('/tenant', { holidayOptions: ['christmas_eve'] })).status).toBe(400);
		expect((await admin.patch('/tenant', { state: 'XX' })).status).toBe(400);
	});

	it('is for admins only', async () => {
		const { hr, employee } = await staff();
		expect((await hr.patch('/tenant', { name: 'Übernommen' })).status).toBe(403);
		expect((await employee.patch('/tenant', { name: 'Übernommen' })).status).toBe(403);
	});

	it('changes the own tenant only', async () => {
		const { admin } = await staff();
		const other = await createTenant();
		await admin.patch('/tenant', { name: 'Nur hier' });
		const { rows } = await api.superuser.query('select name from app.tenants where id = $1', [
			other
		]);
		expect(rows[0].name).toBe('Steuerbüro Beispiel');
	});
});

describe('GET /api/holidays', () => {
	it('lists the holidays of the state for the year', async () => {
		const { employee } = await staff();
		const answer = await employee.get('/holidays?year=2026');
		expect(answer.status).toBe(200);
		expect(answer.body.every((row: unknown) => holidaySchema.safeParse(row).success)).toBe(true);
		expect(answer.body).toHaveLength(11);
		expect(answer.body[0]).toEqual({ date: '2026-01-01', code: 'new_year', portion: 1 });
		expect(answer.body).toContainEqual({ date: '2026-06-04', code: 'corpus_christi', portion: 1 });
	});

	it('follows the settings of the tenant', async () => {
		const { admin, employee } = await staff();
		await admin.patch('/tenant', {
			state: 'BY',
			holidayOptions: ['assumption_day'],
			halfDaysDec24And31: true
		});
		const answer = await employee.get('/holidays?year=2026');
		expect(answer.body).toContainEqual({ date: '2026-08-15', code: 'assumption_day', portion: 1 });
		expect(answer.body).toContainEqual({ date: '2026-12-24', code: 'christmas_eve', portion: 0.5 });
		expect(answer.body).not.toContainEqual(expect.objectContaining({ code: 'augsburg_peace' }));
	});

	it('wants a year between 2000 and 2100', async () => {
		const { employee } = await staff();
		expect((await employee.get('/holidays')).status).toBe(400);
		expect((await employee.get('/holidays?year=1999')).status).toBe(400);
		expect((await employee.get('/holidays?year=zwei')).status).toBe(400);
	});
});
