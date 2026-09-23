import type pg from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	connectAs,
	createPerson,
	createTeam,
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
let team: string;
let lead: Person;
let hr: Account;
let worker: Person;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
	tenant = await createTenant();
	team = await createTeam(tenant);
	lead = await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team });
	hr = await createUser(tenant, { role: 'hr' });
});

// a fresh person per test keeps the running entry of one test out of the next
beforeEach(async () => {
	worker = await createPerson(tenant, { teamId: team });
});

async function addEntry(start: string, end: string | null) {
	return insertId(
		superuser,
		`insert into app.time_entries (tenant_id, employee_id, started_at, ended_at, source)
		 values ($1, $2, $3, $4, 'seed') returning id`,
		[tenant, worker.employeeId, start, end]
	);
}

async function approvedVoid(entry: string) {
	return insertId(
		superuser,
		`insert into app.correction_requests
		   (tenant_id, employee_id, action, target_entry_id, reason, status, requested_by, decided_by, decided_at)
		 values ($1, $2, 'void', $3, 'Doppelt gestempelt, bitte streichen', 'approved', $4, $4, now())
		 returning id`,
		[tenant, worker.employeeId, entry, hr.userId]
	);
}

describe('time entries', () => {
	it('lets a person clock in with the time of the database', async () => {
		await withContext(app, worker.context);
		const { rows } = await app.query(
			`insert into app.time_entries (tenant_id, employee_id, source)
			 values ($1, $2, 'clock') returning started_at = now() as stamped_now, workday::text`,
			[tenant, worker.employeeId]
		);
		expect(rows[0].stamped_now).toBe(true);
		expect(rows[0].workday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('refuses a clock entry with a time from the client', async () => {
		await withContext(app, worker.context);
		await expect(
			app.query(
				`insert into app.time_entries (tenant_id, employee_id, started_at, source)
				 values ($1, $2, now() - interval '1 hour', 'clock')`,
				[tenant, worker.employeeId]
			)
		).rejects.toMatchObject({ code: '23514' });
	});

	it('reports a second running entry on the one-open index', async () => {
		await withContext(app, worker.context);
		const clockIn = `insert into app.time_entries (tenant_id, employee_id, source) values ($1, $2, 'clock')`;
		await app.query(clockIn, [tenant, worker.employeeId]);
		await expect(app.query(clockIn, [tenant, worker.employeeId])).rejects.toMatchObject({
			code: '23505',
			constraint: 'time_entries_one_open_idx'
		});
	});

	it('rejects overlapping entries', async () => {
		await addEntry('2026-02-03 08:00+01', '2026-02-03 12:00+01');
		await expect(addEntry('2026-02-03 11:30+01', '2026-02-03 13:00+01')).rejects.toMatchObject({
			code: '23P01',
			constraint: 'time_entries_no_overlap'
		});
	});

	it('lets entries touch at the boundary', async () => {
		await addEntry('2026-02-04 08:00+01', '2026-02-04 12:00+01');
		await expect(addEntry('2026-02-04 12:00+01', '2026-02-04 16:00+01')).resolves.toBeTruthy();
	});

	it('ignores voided entries in the overlap check', async () => {
		const entry = await addEntry('2026-02-05 08:00+01', '2026-02-05 12:00+01');
		const request = await approvedVoid(entry);
		await superuser.query(
			'update app.time_entries set voided_at = now(), voided_by_request_id = $2 where id = $1',
			[entry, request]
		);
		await expect(addEntry('2026-02-05 09:00+01', '2026-02-05 11:00+01')).resolves.toBeTruthy();
	});

	it('files the workday by the local date of the start', async () => {
		const entry = await addEntry('2026-02-05 23:30+01', '2026-02-06 06:00+01');
		const { rows } = await superuser.query(
			'select workday::text from app.time_entries where id = $1',
			[entry]
		);
		expect(rows[0].workday).toBe('2026-02-05');
	});

	it('ends a running entry once, at now()', async () => {
		await withContext(app, worker.context);
		const entry = await insertId(
			app,
			`insert into app.time_entries (tenant_id, employee_id, source) values ($1, $2, 'clock') returning id`,
			[tenant, worker.employeeId]
		);
		await expect(
			app.query(
				`update app.time_entries set ended_at = now() + interval '1 hour', end_reason = 'leave' where id = $1`,
				[entry]
			)
		).rejects.toMatchObject({ code: '23514' });

		// each statement is its own transaction here, so this now() lies after the start
		await app.query(
			`update app.time_entries set ended_at = now(), end_reason = 'break' where id = $1`,
			[entry]
		);
		await expect(
			app.query(`update app.time_entries set end_reason = 'leave' where id = $1`, [entry])
		).rejects.toMatchObject({ code: 'ZT002' });
	});

	it('does not let a person void their own entry', async () => {
		const entry = await addEntry('2026-02-09 08:00+01', '2026-02-09 12:00+01');
		const request = await approvedVoid(entry);
		await withContext(app, worker.context);
		await expect(
			app.query(
				'update app.time_entries set voided_at = now(), voided_by_request_id = $2 where id = $1',
				[entry, request]
			)
		).rejects.toMatchObject({ code: '42501' });
	});

	it('lets the lead void a team entry, but only once', async () => {
		const entry = await addEntry('2026-02-10 08:00+01', '2026-02-10 12:00+01');
		const request = await approvedVoid(entry);
		await withContext(app, lead.context);
		const voided = await app.query(
			'update app.time_entries set voided_at = now(), voided_by_request_id = $2 where id = $1',
			[entry, request]
		);
		expect(voided.rowCount).toBe(1);

		await expect(
			app.query('update app.time_entries set voided_at = now() where id = $1', [entry])
		).rejects.toMatchObject({ code: 'ZT002' });
	});

	it('keeps the start of an entry fixed', async () => {
		const entry = await addEntry('2026-02-11 08:00+01', '2026-02-11 12:00+01');
		await withContext(app, hr.context);
		await expect(
			app.query(
				`update app.time_entries set started_at = started_at - interval '1 hour' where id = $1`,
				[entry]
			)
		).rejects.toMatchObject({ code: '42501' });
		await expect(
			superuser.query(
				`update app.time_entries set started_at = started_at - interval '1 hour' where id = $1`,
				[entry]
			)
		).rejects.toMatchObject({ code: 'ZT002' });
	});

	it('never deletes an entry', async () => {
		const entry = await addEntry('2026-02-12 08:00+01', '2026-02-12 12:00+01');
		await withContext(app, hr.context);
		await expect(
			app.query('delete from app.time_entries where id = $1', [entry])
		).rejects.toMatchObject({ code: '42501' });
		await expect(
			superuser.query('delete from app.time_entries where id = $1', [entry])
		).rejects.toMatchObject({ code: 'ZT002' });
	});
});
