import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	connectAs,
	createContract,
	createPerson,
	createTenant,
	createUser,
	insertId,
	type Account,
	type Person,
	withContext
} from '../helpers/pg';

let superuser: pg.Client;
let app: pg.Client;
let tenant: string;
let hr: Account;
let admin: Account;
let worker: Person;
let januaryEntry: string;
let januarySick: string;

const locked = { code: 'ZT001' };

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
	tenant = await createTenant();
	hr = await createUser(tenant, { role: 'hr' });
	admin = await createUser(tenant, { role: 'admin' });
	worker = await createPerson(tenant);

	januaryEntry = await insertId(
		superuser,
		`insert into app.time_entries (tenant_id, employee_id, started_at, ended_at, source)
		 values ($1, $2, '2026-01-12 08:00+01', '2026-01-12 16:00+01', 'seed') returning id`,
		[tenant, worker.employeeId]
	);
	januarySick = await insertId(
		superuser,
		`insert into app.absence_requests (tenant_id, employee_id, type, start_date, end_date, status, requested_by)
		 values ($1, $2, 'sick', '2026-01-20', '2026-01-21', 'approved', $3) returning id`,
		[tenant, worker.employeeId, worker.userId]
	);

	await withContext(app, hr.context);
	await close('2025-12-01');
	await close('2026-01-01');
});

function close(month: string) {
	return app.query(
		`insert into app.month_closings (tenant_id, month, action, snapshot, created_by)
		 values ($1, $2, 'close', '{}', $3)`,
		[tenant, month, hr.userId]
	);
}

function reopen(month: string, by: Account) {
	return app.query(
		`insert into app.month_closings (tenant_id, month, action, reason, created_by)
		 values ($1, $2, 'reopen', 'Krankmeldung kam zu spät', $3)`,
		[tenant, month, by.userId]
	);
}

async function closedThrough(employeeId = worker.employeeId) {
	const { rows } = await superuser.query(
		'select closed_through::text as through from app.employees where id = $1',
		[employeeId]
	);
	return rows[0].through;
}

describe('month closing', () => {
	it('moves closed_through of everybody in the tenant', async () => {
		expect(await closedThrough()).toBe('2026-01-31');
	});

	it('locks time entries of a closed month', async () => {
		await expect(
			superuser.query(
				`insert into app.time_entries (tenant_id, employee_id, started_at, ended_at, source)
				 values ($1, $2, '2026-01-13 08:00+01', '2026-01-13 12:00+01', 'seed')`,
				[tenant, worker.employeeId]
			)
		).rejects.toMatchObject(locked);

		const request = await insertId(
			superuser,
			`insert into app.correction_requests (tenant_id, employee_id, action, target_entry_id, reason, requested_by)
			 values ($1, $2, 'void', $3, 'Doppelt gestempelt, bitte streichen', $4) returning id`,
			[tenant, worker.employeeId, januaryEntry, worker.userId]
		);
		await expect(
			superuser.query(
				'update app.time_entries set voided_at = now(), voided_by_request_id = $2 where id = $1',
				[januaryEntry, request]
			)
		).rejects.toMatchObject(locked);
	});

	it('locks absences, absence days, flex bookings and contracts of a closed month', async () => {
		await expect(
			superuser.query(
				`insert into app.absence_requests (tenant_id, employee_id, type, start_date, end_date, requested_by)
				 values ($1, $2, 'vacation', '2026-01-30', '2026-02-03', $3)`,
				[tenant, worker.employeeId, worker.userId]
			)
		).rejects.toMatchObject(locked);
		await expect(
			superuser.query(
				`insert into app.absence_days (tenant_id, employee_id, absence_id, date, portion, target_minutes)
				 values ($1, $2, $3, '2026-01-20', 1, 480)`,
				[tenant, worker.employeeId, januarySick]
			)
		).rejects.toMatchObject(locked);
		await expect(
			superuser.query(
				`insert into app.flex_bookings (tenant_id, employee_id, type, minutes, effective_date, reason)
				 values ($1, $2, 'manual', 60, '2026-01-31', 'Nachtrag Überstunden')`,
				[tenant, worker.employeeId]
			)
		).rejects.toMatchObject(locked);
		await expect(
			createContract(tenant, worker.employeeId, { validFrom: '2026-01-15' })
		).rejects.toMatchObject(locked);
	});

	it('locks a status change but not the certificate of a closed sick note', async () => {
		await withContext(app, hr.context);
		const confirmed = await app.query(
			'update app.absence_requests set certificate_confirmed_at = now() where id = $1',
			[januarySick]
		);
		expect(confirmed.rowCount).toBe(1);

		await expect(
			app.query(`update app.absence_requests set status = 'cancelled' where id = $1`, [januarySick])
		).rejects.toMatchObject(locked);
	});

	it('leaves the month after the closed one open', async () => {
		await expect(
			superuser.query(
				`insert into app.time_entries (tenant_id, employee_id, started_at, ended_at, source)
				 values ($1, $2, '2026-02-02 08:00+01', '2026-02-02 12:00+01', 'seed')`,
				[tenant, worker.employeeId]
			)
		).resolves.toBeTruthy();
	});

	it('gives someone hired after a closing the closed range too', async () => {
		const newcomer = await createPerson(tenant, { entryDate: '2025-06-01' });
		expect(await closedThrough(newcomer.employeeId)).toBe('2026-01-31');
	});

	it('closes only the month after the last closed one', async () => {
		await withContext(app, hr.context);
		await expect(close('2026-01-01')).rejects.toMatchObject({ code: 'ZT003' });
		await expect(close('2026-03-01')).rejects.toMatchObject({ code: 'ZT003' });
	});

	it('never closes the running month, not even as the first closing', async () => {
		const fresh = await createTenant();
		const freshHr = await createUser(fresh, { role: 'hr' });
		await withContext(app, freshHr.context);
		await expect(
			app.query(
				`insert into app.month_closings (tenant_id, month, action, created_by)
				 values ($1, date_trunc('month', now() at time zone 'Europe/Berlin'), 'close', $2)`,
				[fresh, freshHr.userId]
			)
		).rejects.toMatchObject({ code: 'ZT003' });
	});

	it('wants a reason to reopen and leaves reopening to admins', async () => {
		await withContext(app, hr.context);
		await expect(reopen('2026-01-01', hr)).rejects.toMatchObject({ code: '42501' });

		await withContext(app, admin.context);
		await expect(
			app.query(
				`insert into app.month_closings (tenant_id, month, action, created_by)
				 values ($1, '2026-01-01', 'reopen', $2)`,
				[tenant, admin.userId]
			)
		).rejects.toMatchObject({ code: '23514' });
	});

	it('books the cap before the closing row that locks its month', async () => {
		await withContext(app, hr.context);
		const closing = randomUUID();
		await app.query('begin');
		await app.query(
			`insert into app.flex_bookings (tenant_id, employee_id, type, minutes, effective_date, reason, month_closing_id, created_by)
			 values ($1, $2, 'cap_forfeit', -90, '2026-02-28', 'Kappung beim Abschluss Februar', $3, $4)`,
			[tenant, worker.employeeId, closing, hr.userId]
		);
		await app.query(
			`insert into app.month_closings (id, tenant_id, month, action, snapshot, created_by)
			 values ($1, $2, '2026-02-01', 'close', '{}', $3)`,
			[closing, tenant, hr.userId]
		);
		await app.query('commit');

		expect(await closedThrough()).toBe('2026-02-28');
		await expect(
			app.query(
				`insert into app.flex_bookings (tenant_id, employee_id, type, minutes, effective_date, reason)
				 values ($1, $2, 'manual', 30, '2026-02-27', 'Nachtrag nach dem Abschluss')`,
				[tenant, worker.employeeId]
			)
		).rejects.toMatchObject(locked);
	});

	it('refuses a cap whose closing never arrives', async () => {
		await withContext(app, hr.context);
		await app.query('begin');
		await app.query(
			`insert into app.flex_bookings (tenant_id, employee_id, type, minutes, effective_date, reason, month_closing_id)
			 values ($1, $2, 'cap_forfeit', -30, '2026-03-31', 'Kappung ohne Abschluss', $3)`,
			[tenant, worker.employeeId, randomUUID()]
		);
		await expect(app.query('commit')).rejects.toMatchObject({ code: '23503' });
	});

	it('reopens only the last closed month', async () => {
		await withContext(app, admin.context);
		await expect(reopen('2026-01-01', admin)).rejects.toMatchObject({ code: 'ZT003' });
		await reopen('2026-02-01', admin);
		expect(await closedThrough()).toBe('2026-01-31');

		await reopen('2026-01-01', admin);
		await reopen('2025-12-01', admin);
		expect(await closedThrough()).toBeNull();
		await expect(reopen('2025-11-01', admin)).rejects.toMatchObject({ code: 'ZT003' });
	});

	it('keeps closings append-only', async () => {
		await withContext(app, admin.context);
		await expect(app.query('delete from app.month_closings')).rejects.toMatchObject({
			code: '42501'
		});
		await expect(
			superuser.query('update app.month_closings set reason = null where tenant_id = $1', [tenant])
		).rejects.toMatchObject({ code: 'ZT002' });
	});
});
