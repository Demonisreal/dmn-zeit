import { randomUUID } from 'node:crypto';
import { generateDemo } from '@zeit/demo-data';
import type pg from 'pg';
import { Temporal } from 'temporal-polyfill';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	connectAs,
	createPerson,
	createTeam,
	createTenant,
	type Person,
	withContext
} from '../helpers/pg';
import { seedClient, seedDraft } from '../helpers/invoices';
import { fillTenant } from './fixtures';

let superuser: pg.Client;
let app: pg.Client;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
	await app.query(`select set_config('app.demo_mode', 'true', false)`);
});

// one day per request, so none of them clash with another
function askCorrections(person: Person, count: number) {
	return app.query(
		`insert into app.correction_requests
		   (tenant_id, employee_id, action, new_started_at, new_ended_at, reason, requested_by)
		 select $1, $2, 'add', d, d + interval '4 hours', 'Stempeln vergessen, bitte nachtragen', $3
		   from generate_series(1, $4::int) g,
		        lateral (select timestamptz '2026-01-05 08:00+01' + g * interval '1 day') s (d)`,
		[person.context.tenantId, person.employeeId, person.userId, count]
	);
}

async function countIn(table: string, tenantId: string) {
	const { rows } = await superuser.query(
		`select count(*)::int as n from ${table} where tenant_id = $1`,
		[tenantId]
	);
	return rows[0].n as number;
}

describe('sandbox quota', () => {
	it('lets a sandbox fill up to the cap and refuses the row after it', async () => {
		const worker = await createPerson(await createTenant({ kind: 'sandbox' }));
		await withContext(app, worker.context);

		await askCorrections(worker, 200);
		await expect(askCorrections(worker, 1)).rejects.toMatchObject({ code: 'ZT005' });
		expect(await countIn('app.correction_requests', worker.context.tenantId)).toBe(200);
	});

	it('never counts the rows of a live tenant', async () => {
		const worker = await createPerson(await createTenant());
		await withContext(app, worker.context);

		await askCorrections(worker, 200);
		await askCorrections(worker, 50);
		expect(await countIn('app.correction_requests', worker.context.tenantId)).toBe(250);
	});

	it('finds every table it counts readable for its owner', async () => {
		const sandbox = await createTenant({ kind: 'sandbox' });
		await expect(fillTenant(superuser, sandbox)).resolves.toBeDefined();
	});

	it('caps the clients of a sandbox and counts its project entries', async () => {
		const sandbox = await createTenant({ kind: 'sandbox' });
		const worker = await createPerson(sandbox);
		await withContext(app, { tenantId: sandbox, role: 'hr' });
		const addClients = (count: number) =>
			app.query(
				`insert into app.clients (tenant_id, name)
				 select $1, 'Kunde ' || g from generate_series(1, $2::int) g returning id`,
				[sandbox, count]
			);

		const { rows } = await addClients(50);
		await expect(addClients(1)).rejects.toMatchObject({ code: 'ZT005' });
		const project = await app.query(
			`insert into app.projects (tenant_id, client_id, name) values ($1, $2, 'Beratung') returning id`,
			[sandbox, rows[0].id]
		);
		await app.query(
			`insert into app.project_entries (tenant_id, employee_id, project_id, started_at, ended_at, note, source)
			 values ($1, $2, $3, '2026-02-02 08:00+01', '2026-02-02 09:00+01', 'Belege sortiert', 'manual')`,
			[sandbox, worker.employeeId, project.rows[0].id]
		);
		expect(await countIn('app.clients', sandbox)).toBe(50);
		expect(await countIn('app.project_entries', sandbox)).toBe(1);
	});

	it('caps the invoice lines of a sandbox at 2000', async () => {
		const sandbox = await createTenant({ kind: 'sandbox' });
		const client = await seedClient(superuser, sandbox);
		const draft = await seedDraft(superuser, sandbox, client);
		await withContext(app, { tenantId: sandbox, role: 'hr' });
		const addLines = (from: number, count: number) =>
			app.query(
				`insert into app.invoice_lines (
					tenant_id, invoice_id, client_id, position, kind, description, quantity_milli, unit,
					unit_price_cents, net_cents, tax_category, tax_rate_bp
				 )
				 select $1, $2, $3, g, 'item', 'Position ' || g, 1000, 'HUR', 100, 100, 'standard', 1900
				   from generate_series($4::int, $4::int + $5::int - 1) g`,
				[sandbox, draft, client, from, count]
			);

		await addLines(2, 1999);
		await expect(addLines(2001, 1)).rejects.toMatchObject({ code: 'ZT005' });
		expect(await countIn('app.invoice_lines', sandbox)).toBe(2000);
	});
});

describe('ops.sandbox_seed', () => {
	const today = Temporal.Now.plainDateISO('Europe/Berlin');

	it('writes the whole story in one call and leaves no trail of it', async () => {
		const plan = generateDemo({ today, seed: 4711 });
		await withContext(app, { tenantId: plan.tenant.id, role: 'admin' });
		await app.query(`select ops.sandbox_seed($1::jsonb, 'en')`, [JSON.stringify(plan)]);

		expect(await countIn('app.time_entries', plan.tenant.id)).toBe(plan.entries.length);
		expect(await countIn('app.absence_days', plan.tenant.id)).toBe(plan.absenceDays.length);
		expect(await countIn('app.month_closings', plan.tenant.id)).toBe(plan.monthClosings.length);
		expect(await countIn('app.project_entries', plan.tenant.id)).toBe(plan.projectEntries.length);
		expect(await countIn('app.rates', plan.tenant.id)).toBe(plan.rates.length);
		expect(await countIn('audit.log', plan.tenant.id)).toBe(0);
		expect(await countIn('audit.log', plan.solo.tenant.id)).toBe(0);

		const { rows } = await superuser.query(
			`select r.id, r.status::text from app.absence_requests r where r.tenant_id = $1`,
			[plan.tenant.id]
		);
		const statuses = new Map(rows.map((row) => [row.id, row.status]));
		expect(plan.absences.filter((absence) => statuses.get(absence.id) !== absence.status)).toEqual(
			[]
		);

		const people = await superuser.query(
			`select distinct locale, status::text from app.users where tenant_id = $1`,
			[plan.tenant.id]
		);
		expect(people.rows).toEqual([{ locale: 'en', status: 'demo' }]);
	});

	it('trails what the visitor does afterwards', async () => {
		const plan = generateDemo({ today, seed: 815 });
		await withContext(app, { tenantId: plan.tenant.id, role: 'admin' });
		await app.query(`select ops.sandbox_seed($1::jsonb, 'de')`, [JSON.stringify(plan)]);

		const user = plan.users.find((candidate) => candidate.role === 'employee')!;
		const worker: Person = {
			userId: user.id,
			employeeId: user.employeeId!,
			context: {
				tenantId: plan.tenant.id,
				userId: user.id,
				role: 'employee',
				employeeId: user.employeeId
			}
		};
		await withContext(app, worker.context);
		await askCorrections(worker, 1);

		const { rows } = await superuser.query(
			`select table_name, action, actor_user_id from audit.log where tenant_id = $1`,
			[plan.tenant.id]
		);
		expect(rows).toEqual([
			{ table_name: 'correction_requests', action: 'insert', actor_user_id: user.id }
		]);
	});

	// the fence alone lets it through, it reads app.tenant_id once for the old row and once more for the new one
	it('refuses to move a team out of a live tenant into a new sandbox', async () => {
		const live = await createTenant();
		const team = await createTeam(live);
		const sandbox = randomUUID();
		await withContext(app, { tenantId: live, role: 'admin' });
		await app.query('begin');
		await app.query(
			`select ops.sandbox_create($1, 'Musterbetrieb (Beispiel)', $2, 'NW', null, null, 'none')`,
			[sandbox, `musterbetrieb-${sandbox.slice(0, 8)}`]
		);
		await expect(
			app.query(
				`update app.teams set tenant_id = set_config('app.tenant_id', $1, true)::uuid where id = $2`,
				[sandbox, team]
			)
		).rejects.toMatchObject({ code: '42501' });
		await app.query('rollback');

		const { rows } = await superuser.query('select tenant_id from app.teams where id = $1', [team]);
		expect(rows).toEqual([{ tenant_id: live }]);
	});

	// the story reaches back to january of the year before, the end of july is its longest day
	it('fits the plan of 31 july under every cap', async () => {
		const plan = generateDemo({ today: Temporal.PlainDate.from('2026-07-31'), seed: 3107 });
		await withContext(app, { tenantId: plan.tenant.id, role: 'admin' });
		await app.query(`select ops.sandbox_seed($1::jsonb, 'de')`, [JSON.stringify(plan)]);

		expect(await countIn('app.time_entries', plan.tenant.id)).toBe(plan.entries.length);
		expect(await countIn('app.absence_days', plan.tenant.id)).toBe(plan.absenceDays.length);
		expect(await countIn('app.project_entries', plan.tenant.id)).toBe(plan.projectEntries.length);
		expect(await countIn('app.project_entries', plan.solo.tenant.id)).toBe(
			plan.solo.projectEntries.length
		);
		expect(await countIn('audit.log', plan.tenant.id)).toBe(0);
	});

	it('refuses a plan with one time entry more than the cap', async () => {
		const plan = generateDemo({ today, seed: 20001 });
		const employeeId = plan.employees[0]!.id;
		// years before the story starts, so none of them overlaps
		const first = Temporal.Instant.from('2015-01-05T07:00:00Z');
		while (plan.entries.length <= 20_000) {
			const startedAt = first.add({ hours: 2 * plan.entries.length });
			plan.entries.push({
				id: randomUUID(),
				employeeId,
				startedAt: startedAt.toString(),
				endedAt: startedAt.add({ hours: 1 }).toString(),
				endReason: 'leave',
				source: 'seed'
			});
		}
		await withContext(app, { tenantId: plan.tenant.id, role: 'admin' });

		await expect(
			app.query(`select ops.sandbox_seed($1::jsonb, 'de')`, [JSON.stringify(plan)])
		).rejects.toMatchObject({ code: 'ZT005' });
		expect(await countIn('app.time_entries', plan.tenant.id)).toBe(0);
	});

	it('never writes into a tenant that already exists', async () => {
		const live = await createTenant();
		const plan = generateDemo({ today, seed: 99 });
		plan.tenant.id = live;
		await withContext(app, { tenantId: live, role: 'admin' });

		await expect(
			app.query(`select ops.sandbox_seed($1::jsonb, 'de')`, [JSON.stringify(plan)])
		).rejects.toMatchObject({ code: '23505' });
		expect(await countIn('app.time_entries', live)).toBe(0);
	});
});

describe('ops.sandbox_seed solo workspace', () => {
	const today = Temporal.Now.plainDateISO('Europe/Berlin');
	const plan = generateDemo({ today, seed: 2609 });
	// the story starts it at half past eight, a run before that would find it in the future
	plan.solo.projectEntries.find((entry) => entry.endedAt === null)!.startedAt = new Date(
		Date.now() - 10 * 60_000
	).toISOString();

	beforeAll(async () => {
		await withContext(app, { tenantId: plan.tenant.id, role: 'admin' });
		await app.query(`select ops.sandbox_seed($1::jsonb, 'en')`, [JSON.stringify(plan)]);
	});

	it('opens it next to the company, in the same group and with the same expiry', async () => {
		const { rows } = await superuser.query(
			`select id, workspace::text, kind::text, expires_at, sandbox_group
			   from app.tenants where id = any($1) order by workspace`,
			[[plan.tenant.id, plan.solo.tenant.id]]
		);
		expect(rows.map(({ id, workspace, kind }) => ({ id, workspace, kind }))).toEqual([
			{ id: plan.tenant.id, workspace: 'company', kind: 'sandbox' },
			{ id: plan.solo.tenant.id, workspace: 'solo', kind: 'sandbox' }
		]);
		expect(rows[0].sandbox_group).not.toBeNull();
		expect(rows[1].sandbox_group).toBe(rows[0].sandbox_group);
		expect(rows[1].expires_at).toEqual(rows[0].expires_at);
	});

	it('gives each seed a group of its own', async () => {
		const other = generateDemo({ today, seed: 2610 });
		await withContext(app, { tenantId: other.tenant.id, role: 'admin' });
		await app.query(`select ops.sandbox_seed($1::jsonb, 'de')`, [JSON.stringify(other)]);

		const { rows } = await superuser.query(
			'select count(distinct sandbox_group)::int as groups from app.tenants where id = any($1)',
			[[plan.tenant.id, other.tenant.id]]
		);
		expect(rows[0].groups).toBe(2);
	});

	it('seats the freelancer as the one admin of it, with her personnel record', async () => {
		const { rows } = await superuser.query(
			`select u.role::text, u.locale, u.status::text, e.personnel_no
			   from app.users u join app.employees e on e.id = u.employee_id
			  where u.tenant_id = $1`,
			[plan.solo.tenant.id]
		);
		expect(rows).toEqual([{ role: 'admin', locale: 'en', status: 'demo', personnel_no: '1' }]);
	});

	it('writes clients, projects and project time into it', async () => {
		expect(await countIn('app.clients', plan.solo.tenant.id)).toBe(plan.solo.clients.length);
		expect(await countIn('app.tasks', plan.solo.tenant.id)).toBe(plan.solo.tasks.length);
		expect(await countIn('app.project_entries', plan.solo.tenant.id)).toBe(
			plan.solo.projectEntries.length
		);
		const { rows } = await superuser.query(
			`select count(*)::int as running from app.project_entries
			  where tenant_id = $1 and ended_at is null and source = 'seed'`,
			[plan.solo.tenant.id]
		);
		expect(rows[0].running).toBe(1);
	});

	it('lets the freelancer stop the timer the seed left running', async () => {
		const { rows } = await superuser.query(
			'select id, employee_id from app.users where tenant_id = $1',
			[plan.solo.tenant.id]
		);
		await withContext(app, {
			tenantId: plan.solo.tenant.id,
			userId: rows[0].id,
			role: 'admin',
			employeeId: rows[0].employee_id
		});
		const stopped = await app.query(
			`update app.project_entries set ended_at = now()
			  where ended_at is null and voided_at is null returning id`
		);
		expect(stopped.rowCount).toBe(1);
	});
});

describe('outside the demo', () => {
	const refused = { code: '42501', message: 'sandboxes are only seeded in the demo' };

	it('opens and seeds no sandbox without app.demo_mode', async () => {
		const plan = generateDemo({ today: Temporal.Now.plainDateISO('Europe/Berlin'), seed: 2611 });
		const live = await connectAs('app');
		await live.query(`select set_config('app.demo_mode', 'false', false)`);
		await expect(
			live.query(
				`select ops.sandbox_create($1, 'Musterbetrieb (Beispiel)', $2, 'NW', null, null, 'none')`,
				[plan.tenant.id, plan.tenant.slug]
			)
		).rejects.toMatchObject(refused);
		await expect(
			live.query(`select ops.sandbox_seed($1::jsonb, 'de')`, [JSON.stringify(plan)])
		).rejects.toMatchObject(refused);
		// a connection that never set the flag at all
		await expect(
			(await connectAs('app')).query(
				`select ops.sandbox_create($1, 'Musterbetrieb (Beispiel)', $2, 'NW', null, null, 'none')`,
				[plan.tenant.id, plan.tenant.slug]
			)
		).rejects.toMatchObject(refused);

		// zeit_app has no grant on these two, the owner reaches them through zeit_system
		const owner = await connectAs('owner');
		await expect(
			owner.query(`select ops.sandbox_seed_company($1::jsonb, 'de')`, [JSON.stringify(plan)])
		).rejects.toMatchObject(refused);
		await expect(
			owner.query('select ops.sandbox_seed_book($1, $2::jsonb)', [
				await createTenant(),
				JSON.stringify(plan.solo)
			])
		).rejects.toMatchObject(refused);
		expect(await countIn('app.employees', plan.tenant.id)).toBe(0);
	});
});
