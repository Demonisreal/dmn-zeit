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
let client: string;
let project: string;
let closed: string;

const startTimer = `insert into app.project_entries (tenant_id, employee_id, project_id, source)
	values ($1, $2, $3, 'timer') returning id`;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
	tenant = await createTenant();
	team = await createTeam(tenant);
	lead = await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team });
	hr = await createUser(tenant, { role: 'hr' });
	client = await insertId(
		superuser,
		`insert into app.clients (tenant_id, name) values ($1, 'Bäckerei Korn') returning id`,
		[tenant]
	);
	project = await insertId(
		superuser,
		`insert into app.projects (tenant_id, client_id, name) values ($1, $2, 'Website') returning id`,
		[tenant, client]
	);
	closed = await insertId(
		superuser,
		`insert into app.projects (tenant_id, client_id, name, open_to_all)
		 values ($1, $2, 'Jahresabschluss', false) returning id`,
		[tenant, client]
	);
	await superuser.query(
		`insert into app.rates (tenant_id, client_id, valid_from, rate_cents) values ($1, $2, '2026-01-01', 9500)`,
		[tenant, client]
	);
});

// a fresh person per test keeps the running timer of one test out of the next
beforeEach(async () => {
	worker = await createPerson(tenant, { teamId: team });
});

async function book(person: Person, start: string, end: string, projectId = project) {
	await withContext(app, person.context);
	return insertId(
		app,
		`insert into app.project_entries (tenant_id, employee_id, project_id, started_at, ended_at, note, source)
		 values ($1, $2, $3, $4, $5, 'Startseite', 'manual') returning id`,
		[tenant, person.employeeId, projectId, start, end]
	);
}

describe('project entries', () => {
	it('starts a timer with the time of the database', async () => {
		await withContext(app, worker.context);
		const { rows } = await app.query(
			`insert into app.project_entries (tenant_id, employee_id, project_id, source)
			 values ($1, $2, $3, 'timer') returning started_at = now() as stamped_now`,
			[tenant, worker.employeeId, project]
		);
		expect(rows[0].stamped_now).toBe(true);
	});

	it('refuses a timer with a time from the client', async () => {
		await withContext(app, worker.context);
		await expect(
			app.query(
				`insert into app.project_entries (tenant_id, employee_id, project_id, started_at, source)
				 values ($1, $2, $3, now() - interval '1 hour', 'timer')`,
				[tenant, worker.employeeId, project]
			)
		).rejects.toMatchObject({ code: '23514' });
	});

	it('reports a second running timer on the one-running index', async () => {
		await withContext(app, worker.context);
		await app.query(startTimer, [tenant, worker.employeeId, project]);
		await expect(app.query(startTimer, [tenant, worker.employeeId, project])).rejects.toMatchObject(
			{
				code: '23505',
				constraint: 'project_entries_one_running_idx'
			}
		);
	});

	it('rejects overlapping entries', async () => {
		await book(worker, '2026-03-03 08:00+01', '2026-03-03 12:00+01');
		await expect(book(worker, '2026-03-03 11:30+01', '2026-03-03 13:00+01')).rejects.toMatchObject({
			code: '23P01',
			constraint: 'project_entries_no_overlap'
		});
	});

	it('stops a running timer at now() and changes nothing else on it', async () => {
		const other = await insertId(
			superuser,
			`insert into app.projects (tenant_id, client_id, name) values ($1, $2, 'Newsletter') returning id`,
			[tenant, client]
		);
		await withContext(app, worker.context);
		const entry = await insertId(app, startTimer, [tenant, worker.employeeId, project]);
		await expect(
			app.query(
				`update app.project_entries set ended_at = now() + interval '1 hour' where id = $1`,
				[entry]
			)
		).rejects.toMatchObject({ code: '23514' });
		await expect(
			app.query(
				`update app.project_entries set started_at = started_at - interval '1 hour' where id = $1`,
				[entry]
			)
		).rejects.toMatchObject({ code: 'ZT002' });
		await expect(
			app.query('update app.project_entries set project_id = $2 where id = $1', [entry, other])
		).rejects.toMatchObject({ code: 'ZT002' });

		// each statement is its own transaction here, so this now() lies after the start
		const stopped = await app.query(
			`update app.project_entries set ended_at = now(), note = 'Startseite' where id = $1`,
			[entry]
		);
		expect(stopped.rowCount).toBe(1);
		const moved = await app.query(
			`update app.project_entries set started_at = started_at - interval '1 hour' where id = $1`,
			[entry]
		);
		expect(moved.rowCount).toBe(1);
	});

	it('freezes a voided entry', async () => {
		const entry = await book(worker, '2026-03-04 08:00+01', '2026-03-04 10:00+01');
		await app.query('update app.project_entries set voided_at = now() where id = $1', [entry]);
		await expect(
			app.query(`update app.project_entries set note = 'doch nicht' where id = $1`, [entry])
		).rejects.toMatchObject({ code: 'ZT002' });
	});

	it('freezes an invoiced entry and leaves the invoice to hr', async () => {
		const entry = await book(worker, '2026-03-05 08:00+01', '2026-03-05 10:00+01');
		await expect(
			app.query('update app.project_entries set invoice_id = gen_random_uuid() where id = $1', [
				entry
			])
		).rejects.toMatchObject({ code: '42501' });

		await withContext(app, hr.context);
		const draft = await insertId(
			app,
			`insert into app.invoices (tenant_id, client_id, service_from, service_to, payment_terms_days, format, tax_profile)
			 values ($1, $2, current_date, current_date, 14, 'pdf', 'regular') returning id`,
			[tenant, client]
		);
		await app.query('update app.project_entries set invoice_id = $2 where id = $1', [entry, draft]);

		await withContext(app, worker.context);
		await expect(
			app.query(`update app.project_entries set note = 'nachträglich' where id = $1`, [entry])
		).rejects.toMatchObject({ code: 'ZT004' });

		await withContext(app, hr.context);
		const released = await app.query(
			'update app.project_entries set invoice_id = null where id = $1',
			[entry]
		);
		expect(released.rowCount).toBe(1);
	});

	it('shows a person their own entries, the lead and hr the others too', async () => {
		const colleague = await createPerson(tenant, { teamId: team });
		await book(colleague, '2026-03-06 08:00+01', '2026-03-06 09:00+01');
		for (const [context, n] of [
			[worker.context, 0],
			[lead.context, 1],
			[hr.context, 1]
		] as const) {
			await withContext(app, context);
			const { rows } = await app.query(
				'select count(*)::int as n from app.project_entries where employee_id = $1',
				[colleague.employeeId]
			);
			expect(rows[0].n).toBe(n);
		}
	});

	it('shows employees and leads no rates and no client master data', async () => {
		for (const person of [worker, lead]) {
			await withContext(app, person.context);
			for (const table of ['app.rates', 'app.clients', 'app.projects']) {
				const { rows } = await app.query(`select count(*)::int as n from ${table}`);
				expect(rows[0].n, table).toBe(0);
			}
		}
		await withContext(app, hr.context);
		const { rows } = await app.query('select count(*)::int as n from app.rates');
		expect(rows[0].n).toBe(1);
	});

	it('books a closed project only for members and hr', async () => {
		await expect(
			book(worker, '2026-03-09 08:00+01', '2026-03-09 09:00+01', closed)
		).rejects.toMatchObject({ code: '42501' });

		await withContext(app, hr.context);
		await expect(
			insertId(
				app,
				`insert into app.project_entries (tenant_id, employee_id, project_id, started_at, ended_at, note, source)
				 values ($1, $2, $3, '2026-03-09 08:00+01', '2026-03-09 09:00+01', 'Belege', 'manual') returning id`,
				[tenant, worker.employeeId, closed]
			)
		).resolves.toBeTruthy();

		await superuser.query(
			'insert into app.project_members (tenant_id, project_id, employee_id) values ($1, $2, $3)',
			[tenant, closed, worker.employeeId]
		);
		await expect(
			book(worker, '2026-03-09 10:00+01', '2026-03-09 11:00+01', closed)
		).resolves.toBeTruthy();
	});

	it('lists what a person may book and still names archived projects', async () => {
		const old = await insertId(
			superuser,
			`insert into app.projects (tenant_id, client_id, name, archived_at)
			 values ($1, $2, 'Altprojekt', now()) returning id`,
			[tenant, client]
		);
		await superuser.query(
			`insert into app.tasks (tenant_id, client_id, project_id, name) values ($1, $2, $3, 'Texte')`,
			[tenant, client, project]
		);
		await withContext(app, worker.context);

		const bookable = await app.query(
			`select id, client_name, billable, rounding_increment_min, rounding_mode, tasks
			   from app.bookable_projects()`
		);
		const ids = bookable.rows.map((r) => r.id);
		expect(ids).not.toContain(closed);
		expect(ids).not.toContain(old);
		expect(bookable.rows.find((r) => r.id === project)).toEqual({
			id: project,
			client_name: 'Bäckerei Korn',
			billable: true,
			rounding_increment_min: null,
			rounding_mode: null,
			tasks: [{ id: expect.any(String), name: 'Texte', billable: null }]
		});

		const labels = await app.query('select project_name from app.project_labels($1)', [[old]]);
		expect(labels.rows).toEqual([{ project_name: 'Altprojekt' }]);
	});

	it('hides the names of a restricted client below hr', async () => {
		const gone = await insertId(
			superuser,
			`insert into app.clients (tenant_id, name, archived_at, restricted_at)
			 values ($1, 'Anna Privat', now(), now()) returning id`,
			[tenant]
		);
		const garden = await insertId(
			superuser,
			`insert into app.projects (tenant_id, client_id, name) values ($1, $2, 'Garten Privat') returning id`,
			[tenant, gone]
		);
		const labels = 'select project_name, client_name from app.project_labels($1)';

		await withContext(app, worker.context);
		expect((await app.query(labels, [[garden]])).rows).toEqual([
			{ project_name: 'gesperrt', client_name: 'gesperrt' }
		]);
		await withContext(app, hr.context);
		expect((await app.query(labels, [[garden]])).rows).toEqual([
			{ project_name: 'Garten Privat', client_name: 'Anna Privat' }
		]);
	});

	it('sums the finished billable minutes of everyone for the budget', async () => {
		const budgeted = await insertId(
			superuser,
			`insert into app.projects (tenant_id, client_id, name, budget_minutes)
			 values ($1, $2, 'Relaunch', 600) returning id`,
			[tenant, client]
		);
		const internal = await insertId(
			superuser,
			`insert into app.tasks (tenant_id, client_id, project_id, name, billable)
			 values ($1, $2, $3, 'Abstimmung', false) returning id`,
			[tenant, client, budgeted]
		);
		const colleague = await createPerson(tenant, { teamId: team });
		await book(worker, '2026-04-01 08:00+02', '2026-04-01 09:00+02', budgeted);
		await book(colleague, '2026-04-01 08:00+02', '2026-04-01 08:30:20+02', budgeted);
		const voided = await book(worker, '2026-04-02 08:00+02', '2026-04-02 12:00+02', budgeted);
		await app.query('update app.project_entries set voided_at = now() where id = $1', [voided]);
		const meeting = await book(worker, '2026-04-03 08:00+02', '2026-04-03 10:00+02', budgeted);
		await app.query('update app.project_entries set task_id = $1 where id = $2', [
			internal,
			meeting
		]);
		await app.query(startTimer, [tenant, worker.employeeId, budgeted]);

		await withContext(app, colleague.context);
		const status = 'select budget_minutes, used_minutes from app.project_budget_status($1)';
		expect((await app.query(status, [budgeted])).rows).toEqual([
			{ budget_minutes: 600, used_minutes: 90 }
		]);

		await withContext(app, hr.context);
		expect((await app.query(status, [budgeted])).rows).toEqual([]);
	});

	it('never deletes an entry', async () => {
		const entry = await book(worker, '2026-03-10 08:00+01', '2026-03-10 09:00+01');
		await withContext(app, hr.context);
		await expect(
			app.query('delete from app.project_entries where id = $1', [entry])
		).rejects.toMatchObject({ code: '42501' });
		await expect(
			superuser.query('delete from app.project_entries where id = $1', [entry])
		).rejects.toMatchObject({ code: 'ZT002' });
	});

	it('caps a manual entry at 24 hours', async () => {
		await withContext(app, worker.context);
		await expect(
			app.query(
				`insert into app.project_entries (tenant_id, employee_id, project_id, started_at, ended_at, note, source)
				 values ($1, $2, $3, '2026-03-11 00:00+01', '2026-03-12 01:00+01', 'zu lang', 'manual')`,
				[tenant, worker.employeeId, project]
			)
		).rejects.toMatchObject({ code: '23514' });
	});

	it('lets only hr mark an entry billable', async () => {
		const entry = await book(worker, '2026-03-12 08:00+01', '2026-03-12 09:00+01');
		await withContext(app, worker.context);
		await expect(
			app.query('update app.project_entries set billable = false where id = $1', [entry])
		).rejects.toMatchObject({ code: '42501' });

		await withContext(app, hr.context);
		const marked = await app.query(
			'update app.project_entries set billable = false where id = $1',
			[entry]
		);
		expect(marked.rowCount).toBe(1);
	});

	it('turns a corrected timer entry into a manual one', async () => {
		await withContext(app, worker.context);
		const entry = await insertId(
			app,
			`insert into app.project_entries (tenant_id, employee_id, project_id, source)
			 values ($1, $2, $3, 'timer') returning id`,
			[tenant, worker.employeeId, project]
		);
		await app.query(`update app.project_entries set ended_at = now(), note = 'Startseite' where id = $1`, [
			entry
		]);

		// the running timer already claimed now(), pushing the start back is the only safe correction here
		const corrected = await app.query(
			`update app.project_entries set started_at = started_at - interval '10 minutes' where id = $1
			 returning source`,
			[entry]
		);
		expect(corrected.rows[0].source).toBe('manual');
	});
});
