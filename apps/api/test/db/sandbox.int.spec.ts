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
import { fillTenant } from './fixtures';

let superuser: pg.Client;
let app: pg.Client;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
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
		expect(await countIn('audit.log', plan.tenant.id)).toBe(0);

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

	// the fence reads app.tenant_id once for the old row and once more for the new one
	it('trails a team moved out of a live tenant into a new sandbox', async () => {
		const live = await createTenant();
		const team = await createTeam(live);
		const sandbox = randomUUID();
		await withContext(app, { tenantId: live, role: 'admin' });
		await app.query('begin');
		await app.query(
			`select ops.sandbox_create($1, 'Musterbetrieb (Beispiel)', $2, 'NW', null, null, 'none')`,
			[sandbox, `musterbetrieb-${sandbox.slice(0, 8)}`]
		);
		const moved = await app.query(
			`update app.teams set tenant_id = set_config('app.tenant_id', $1, true)::uuid where id = $2`,
			[sandbox, team]
		);
		await app.query('commit');
		expect(moved.rowCount).toBe(1);

		const { rows } = await superuser.query(
			`select tenant_id, diff from audit.log where table_name = 'teams' and row_id = $1 and action = 'update'`,
			[team]
		);
		expect(rows).toEqual([{ tenant_id: sandbox, diff: { tenant_id: [live, sandbox] } }]);
	});

	// the story reaches back to january of the year before, the end of july is its longest day
	it('fits the plan of 31 july under every cap', async () => {
		const plan = generateDemo({ today: Temporal.PlainDate.from('2026-07-31'), seed: 3107 });
		await withContext(app, { tenantId: plan.tenant.id, role: 'admin' });
		await app.query(`select ops.sandbox_seed($1::jsonb, 'de')`, [JSON.stringify(plan)]);

		expect(await countIn('app.time_entries', plan.tenant.id)).toBe(plan.entries.length);
		expect(await countIn('app.absence_days', plan.tenant.id)).toBe(plan.absenceDays.length);
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
