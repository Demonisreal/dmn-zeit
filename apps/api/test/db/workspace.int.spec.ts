import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectAs, createPerson, createTenant, type Person, withContext } from '../helpers/pg';

const clockIn = `insert into app.time_entries (tenant_id, employee_id, source) values ($1, $2, 'clock')`;

let superuser: pg.Client;
let app: pg.Client;
let solo: string;
let freelancer: Person;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
	solo = await createTenant({ workspace: 'solo' });
	freelancer = await createPerson(solo, { role: 'admin' });
});

describe('solo workspace', () => {
	it('sees no time entry, not even one that is there', async () => {
		await superuser.query(
			`insert into app.time_entries (tenant_id, employee_id, started_at, ended_at, source)
			 values ($1, $2, '2026-02-02 08:00+01', '2026-02-02 12:00+01', 'seed')`,
			[solo, freelancer.employeeId]
		);
		await withContext(app, freelancer.context);
		const { rows } = await app.query('select count(*)::int as n from app.time_entries');
		expect(rows[0].n).toBe(0);
	});

	it('cannot clock in', async () => {
		await withContext(app, freelancer.context);
		await expect(app.query(clockIn, [solo, freelancer.employeeId])).rejects.toMatchObject({
			code: '42501',
			message: expect.stringContaining('row-level security')
		});
	});

	it('still sees its own personnel record', async () => {
		await withContext(app, freelancer.context);
		const { rows } = await app.query('select id from app.employees');
		expect(rows).toEqual([{ id: freelancer.employeeId }]);
	});

	it('takes neither a second user nor a second employee', async () => {
		await expect(
			superuser.query(
				`insert into app.users (tenant_id, email, display_name, role)
				 values ($1, 'zweite@example.test', 'Zweite Person', 'admin')`,
				[solo]
			)
		).rejects.toMatchObject({ code: 'ZT003' });
		await expect(
			superuser.query(
				`insert into app.employees (tenant_id, personnel_no, first_name, last_name, entry_date)
				 values ($1, '2', 'Max', 'Zweit', '2026-01-01')`,
				[solo]
			)
		).rejects.toMatchObject({ code: 'ZT003' });
	});

	// the first insert holds its transaction open, without the advisory lock the second would not see it
	it('lets only one of two parallel invitations in', async () => {
		const tenant = await createTenant({ workspace: 'solo' });
		const first = await connectAs('superuser');
		const second = await connectAs('superuser');
		const invite = (client: pg.Client) =>
			client.query(
				`insert into app.users (tenant_id, email, display_name, role)
				 values ($1, gen_random_uuid() || '@example.test', 'Anna Admin', 'admin')`,
				[tenant]
			);
		const { rows } = await second.query<{ pid: number }>('select pg_backend_pid() as pid');

		await first.query('begin');
		await invite(first);
		const refused = expect(invite(second)).rejects.toMatchObject({ code: 'ZT003' });
		while (!(await waitsOnLock(rows[0]!.pid))) await new Promise((wake) => setTimeout(wake, 10));
		await first.query('commit');

		await refused;
		const users = await superuser.query('select 1 from app.users where tenant_id = $1', [tenant]);
		expect(users.rowCount).toBe(1);
	});
});

async function waitsOnLock(pid: number) {
	const { rows } = await superuser.query(
		'select wait_event_type from pg_stat_activity where pid = $1',
		[pid]
	);
	return rows[0]?.wait_event_type === 'Lock';
}

describe('company workspace', () => {
	it('clocks in as before', async () => {
		const tenant = await createTenant();
		const worker = await createPerson(tenant);
		await withContext(app, worker.context);
		expect((await app.query(clockIn, [tenant, worker.employeeId])).rowCount).toBe(1);
		const { rows } = await app.query('select count(*)::int as n from app.time_entries');
		expect(rows[0].n).toBe(1);
	});
});
