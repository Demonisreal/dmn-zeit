import { flexAccountSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api, type Browser } from '../auth/api';
import { createContract, createPerson, createTenant, createUser, type Person } from '../helpers/pg';
import { addEntry, signedIn } from './people';

let api: Api;
let tenant: string;
let worker: Person & { browser: Browser };
let partTime: Person & { browser: Browser };

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	await api.superuser.query(
		`update app.tenants set flex_cap_plus_min = 2400, flex_cap_mode = 'warn' where id = $1`,
		[tenant]
	);
	const hr = await createUser(tenant, { role: 'hr' });
	worker = await signedIn(api, await createPerson(tenant, { entryDate: '2025-12-01' }));
	partTime = await signedIn(api, await createPerson(tenant, { entryDate: '2025-12-01' }));
	await createContract(tenant, worker.employeeId);
	await api.superuser.query(
		`with model as (
			insert into app.work_models (tenant_id, name, min_mon, min_tue, min_wed, min_thu, min_fri, min_sat, min_sun)
			values ($1, 'Teilzeit 20 h', 240, 240, 240, 240, 240, 0, 0) returning id
		)
		insert into app.contracts (
			tenant_id, employee_id, valid_from, work_model_id,
			min_mon, min_tue, min_wed, min_thu, min_fri, min_sat, min_sun,
			vacation_days_year, vacation_basis_days, flex_cap_plus_min, flex_cap_minus_min
		)
		select $1, $2, '2025-12-01', id, 240, 240, 240, 240, 240, 0, 0, 15, 5, 600, 300 from model`,
		[tenant, partTime.employeeId]
	);

	await addEntry(api, worker, '2025-12-01T08:00:00+01:00', '2025-12-01T16:00:00+01:00');
	await api.superuser.query(
		`insert into app.flex_bookings (tenant_id, employee_id, type, minutes, effective_date, reason, created_by)
		 values ($1, $2, 'opening', 600, '2025-12-01', 'Guthaben aus dem alten System', $3),
		        ($1, $2, 'manual', -120, '2025-12-15', 'Arzttermin nachgetragen', $3)`,
		[tenant, worker.employeeId, hr.userId]
	);
});

afterAll(() => api.app.close());

const flex = (browser: Browser, employeeId: string, year: number | string) =>
	browser.get(`/employees/${employeeId}/flex?year=${year}`);

describe('GET /api/employees/:id/flex', () => {
	it('counts a past year through 31 December, month by month on top of the opening', async () => {
		const answer = await flex(worker.browser, worker.employeeId, 2025);

		expect(answer.status).toBe(200);
		const account = flexAccountSchema.parse(answer.body);
		expect(account).toMatchObject({
			employeeId: worker.employeeId,
			year: 2025,
			openingMinutes: 600,
			balanceMinutes: -9120,
			asOf: '2025-12-31',
			cap: { plusMinutes: 2400, minusMinutes: null, mode: 'warn' }
		});
		expect(account.months).toHaveLength(12);
		expect(account.months[0]).toMatchObject({
			month: '2025-01',
			targetMinutes: 0,
			balanceMinutes: 600
		});
		// 21 working days: 23 weekdays less christmas day and boxing day
		expect(account.months[11]).toEqual({
			month: '2025-12',
			targetMinutes: 10080,
			workedMinutes: 480,
			creditedMinutes: 0,
			bookedMinutes: -120,
			diffMinutes: -9600,
			balanceMinutes: -9120,
			closed: false
		});
		expect(
			account.bookings.map((booking) => [booking.type, booking.createdBy?.displayName])
		).toEqual([
			['opening', 'Erika Muster'],
			['manual', 'Erika Muster']
		]);
	});

	it('takes the cap of the contract over the one of the tenant', async () => {
		const answer = await flex(partTime.browser, partTime.employeeId, 2025);
		expect(answer.body.cap).toEqual({ plusMinutes: 600, minusMinutes: 300, mode: 'warn' });
		expect(answer.body.months[11].targetMinutes).toBe(5040);
	});

	it('counts the running year through today and a future one not at all', async () => {
		const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(
			new Date()
		);
		const year = Number(today.slice(0, 4));

		const current = await flex(worker.browser, worker.employeeId, year);
		expect(current.body.asOf).toBe(today);
		expect(current.body.months.at(-1).month).toBe(today.slice(0, 7));

		const future = await flex(worker.browser, worker.employeeId, year + 1);
		expect(future.body).toMatchObject({ asOf: today, months: [], balanceMinutes: 0 });
	});

	it('keeps the account of others out of reach and checks the year', async () => {
		expect((await flex(worker.browser, partTime.employeeId, 2025)).status).toBe(403);
		expect((await flex(worker.browser, worker.employeeId, 'letztes')).status).toBe(400);
		expect((await flex(worker.browser, worker.employeeId, 1999)).status).toBe(400);
	});
});
