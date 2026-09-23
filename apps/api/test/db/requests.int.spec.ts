import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	connectAs,
	createPerson,
	createTeam,
	createTenant,
	insertId,
	type Person,
	withContext
} from '../helpers/pg';

let superuser: pg.Client;
let app: pg.Client;
let tenant: string;
let lead: Person;
let worker: Person;
let hr: Person;

const reason = 'Gehen vergessen, war um 17 Uhr weg';

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
	tenant = await createTenant();
	const team = await createTeam(tenant);
	lead = await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team });
	worker = await createPerson(tenant, { teamId: team });
	hr = await createPerson(tenant, { role: 'hr' });
});

async function entryOf(person: Person, day: string) {
	return insertId(
		superuser,
		`insert into app.time_entries (tenant_id, employee_id, started_at, ended_at, source)
		 values ($1, $2, $3::date + time '08:00', $3::date + time '16:00', 'seed') returning id`,
		[tenant, person.employeeId, day]
	);
}

async function requestCorrection(person: Person, day: string) {
	const entry = await entryOf(person, day);
	await withContext(app, person.context);
	return insertId(
		app,
		`insert into app.correction_requests
		   (tenant_id, employee_id, action, target_entry_id, new_started_at, new_ended_at, reason, requested_by)
		 values ($1, $2, 'change', $3, $4::date + time '08:00', $4::date + time '17:00', $5, $6)
		 returning id`,
		[tenant, person.employeeId, entry, day, reason, person.userId]
	);
}

async function decide(request: string, decider: Person, status: string) {
	await withContext(app, decider.context);
	return app.query(
		`update app.correction_requests
		    set status = $2, decided_by = $3, decided_at = now()
		  where id = $1`,
		[request, status, decider.userId]
	);
}

describe('correction requests', () => {
	it('lets the lead approve a correction of the team', async () => {
		const request = await requestCorrection(worker, '2026-04-06');
		const approved = await decide(request, lead, 'approved');
		expect(approved.rowCount).toBe(1);
	});

	it('never lets anyone approve a correction of their own times', async () => {
		// the lead is a member of the team they lead
		const request = await requestCorrection(lead, '2026-04-07');
		await expect(decide(request, lead, 'approved')).rejects.toMatchObject({
			code: '42501',
			message: expect.stringContaining('nobody decides on their own')
		});
	});

	it('lets hr correct the times of someone else directly', async () => {
		const entry = await entryOf(worker, '2026-04-08');
		await withContext(app, hr.context);
		const { rows } = await app.query(
			`insert into app.correction_requests
			   (tenant_id, employee_id, action, target_entry_id, reason, status, requested_by, decided_by, decided_at)
			 values ($1, $2, 'void', $3, $4, 'approved', $5, $5, now())
			 returning status`,
			[tenant, worker.employeeId, entry, reason, hr.userId]
		);
		expect(rows[0].status).toBe('approved');
	});

	it('does not let hr correct their own times directly', async () => {
		const entry = await entryOf(hr, '2026-04-09');
		await withContext(app, hr.context);
		await expect(
			app.query(
				`insert into app.correction_requests
				   (tenant_id, employee_id, action, target_entry_id, reason, status, requested_by, decided_by, decided_at)
				 values ($1, $2, 'void', $3, $4, 'approved', $5, $5, now())`,
				[tenant, hr.employeeId, entry, reason, hr.userId]
			)
		).rejects.toMatchObject({ code: '42501' });
	});

	it('refuses a target entry that belongs to someone else', async () => {
		const ownEntry = await entryOf(hr, '2026-04-10');
		await withContext(app, hr.context);
		await expect(
			app.query(
				`insert into app.correction_requests
				   (tenant_id, employee_id, action, target_entry_id, reason, status, requested_by, decided_by, decided_at)
				 values ($1, $2, 'void', $3, $4, 'approved', $5, $5, now())`,
				[tenant, worker.employeeId, ownEntry, reason, hr.userId]
			)
		).rejects.toMatchObject({ code: '23503' });
	});

	it('starts a request as pending unless it is a direct correction', async () => {
		const entry = await entryOf(worker, '2026-04-13');
		await withContext(app, hr.context);
		await expect(
			app.query(
				`insert into app.correction_requests
				   (tenant_id, employee_id, action, target_entry_id, reason, status, requested_by, decided_by, decided_at)
				 values ($1, $2, 'void', $3, $4, 'approved', $5, $6, now())`,
				[tenant, worker.employeeId, entry, reason, worker.userId, hr.userId]
			)
		).rejects.toMatchObject({ code: 'ZT003' });
	});

	it('lets a person withdraw a request but not approve it', async () => {
		const request = await requestCorrection(worker, '2026-04-14');
		await expect(decide(request, worker, 'approved')).rejects.toMatchObject({ code: '42501' });

		await withContext(app, worker.context);
		const withdrawn = await app.query(
			`update app.correction_requests set status = 'withdrawn' where id = $1`,
			[request]
		);
		expect(withdrawn.rowCount).toBe(1);
	});

	it('keeps a decided request decided', async () => {
		const request = await requestCorrection(worker, '2026-04-15');
		await decide(request, lead, 'rejected');
		await expect(decide(request, lead, 'approved')).rejects.toMatchObject({ code: 'ZT003' });
	});

	it('wants at least ten characters of reason', async () => {
		const entry = await entryOf(worker, '2026-04-16');
		await withContext(app, worker.context);
		await expect(
			app.query(
				`insert into app.correction_requests (tenant_id, employee_id, action, target_entry_id, reason, requested_by)
				 values ($1, $2, 'void', $3, 'vergessen', $4)`,
				[tenant, worker.employeeId, entry, worker.userId]
			)
		).rejects.toMatchObject({ code: '23514' });
	});
});

describe('absence requests', () => {
	async function requestAbsence(
		person: Person,
		type: string,
		start: string,
		end: string,
		status = 'pending'
	) {
		await withContext(app, person.context);
		return insertId(
			app,
			`insert into app.absence_requests (tenant_id, employee_id, type, start_date, end_date, status, requested_by)
			 values ($1, $2, $3, $4, $5, $6, $7) returning id`,
			[tenant, person.employeeId, type, start, end, status, person.userId]
		);
	}

	it('keeps open vacation requests of one person apart', async () => {
		await requestAbsence(worker, 'vacation', '2026-05-04', '2026-05-08');
		await expect(
			requestAbsence(worker, 'time_off', '2026-05-08', '2026-05-08')
		).rejects.toMatchObject({
			code: '23P01',
			constraint: 'absence_requests_no_overlap'
		});
	});

	it('takes a sick note without approval, even during vacation', async () => {
		await requestAbsence(worker, 'vacation', '2026-06-01', '2026-06-05');
		const sick = await requestAbsence(worker, 'sick', '2026-06-03', '2026-06-04', 'approved');
		expect(sick).toBeTruthy();
	});

	it('does not let a person approve their own vacation', async () => {
		await withContext(app, worker.context);
		await expect(
			app.query(
				`insert into app.absence_requests
				   (tenant_id, employee_id, type, start_date, end_date, status, requested_by, decided_by, decided_at)
				 values ($1, $2, 'vacation', '2026-07-06', '2026-07-10', 'approved', $3, $3, now())`,
				[tenant, worker.employeeId, worker.userId]
			)
		).rejects.toMatchObject({ code: '42501', message: expect.stringContaining('nobody decides') });
		await expect(
			requestAbsence(worker, 'vacation', '2026-07-06', '2026-07-10', 'approved')
		).rejects.toMatchObject({ code: 'ZT003' });
	});

	it('frees the dates once a request is withdrawn', async () => {
		const first = await requestAbsence(worker, 'vacation', '2026-08-03', '2026-08-07');
		await app.query(`update app.absence_requests set status = 'withdrawn' where id = $1`, [first]);
		await expect(
			requestAbsence(worker, 'vacation', '2026-08-03', '2026-08-07')
		).resolves.toBeTruthy();
	});

	it('walks a cancellation through cancel_pending', async () => {
		const request = await requestAbsence(worker, 'vacation', '2026-09-07', '2026-09-11');
		await withContext(app, lead.context);
		await app.query(
			`update app.absence_requests set status = 'approved', decided_by = $2, decided_at = now() where id = $1`,
			[request, lead.userId]
		);

		await withContext(app, worker.context);
		await app.query(`update app.absence_requests set status = 'cancel_pending' where id = $1`, [
			request
		]);
		await expect(
			app.query(`update app.absence_requests set status = 'cancelled' where id = $1`, [request])
		).rejects.toMatchObject({ code: '42501' });

		await withContext(app, lead.context);
		await app.query(`update app.absence_requests set status = 'cancelled' where id = $1`, [
			request
		]);
		await expect(
			app.query(`update app.absence_requests set status = 'approved' where id = $1`, [request])
		).rejects.toMatchObject({ code: 'ZT003' });
	});

	it('confirms a certificate only on a sick note', async () => {
		const vacation = await requestAbsence(worker, 'vacation', '2026-10-05', '2026-10-09');
		await withContext(app, hr.context);
		await expect(
			app.query('update app.absence_requests set certificate_confirmed_at = now() where id = $1', [
				vacation
			])
		).rejects.toMatchObject({ code: '23514' });
	});
});
