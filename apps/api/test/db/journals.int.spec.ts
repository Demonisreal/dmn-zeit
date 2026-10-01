import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectAs, createTenant, createUser, type Person, withContext } from '../helpers/pg';
import { fillTenant } from './fixtures';

let superuser: pg.Client;
let app: pg.Client;
let tenant: string;
let worker: Person;

const journals = [
	'app.vacation_ledger',
	'app.flex_bookings',
	'app.month_closings',
	'app.invoice_documents',
	'audit.log'
];

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
	tenant = await createTenant();
	({ worker } = await fillTenant(superuser, tenant));
});

describe('journals', () => {
	it.each(journals)('keeps %s append-only', async (table) => {
		const admin = await createUser(tenant, { role: 'admin' });
		await withContext(app, admin.context);
		await expect(app.query(`delete from ${table}`)).rejects.toMatchObject({ code: '42501' });

		await expect(
			superuser.query(`update ${table} set tenant_id = tenant_id where tenant_id = $1`, [tenant])
		).rejects.toMatchObject({ code: 'ZT002' });
		await expect(
			superuser.query(`delete from ${table} where tenant_id = $1`, [tenant])
		).rejects.toMatchObject({ code: 'ZT002' });
		await expect(superuser.query(`truncate ${table} cascade`)).rejects.toMatchObject({
			code: 'ZT002'
		});
	});

	it.each(journals)('keeps %s closed to zeit_app that sets zeit.purge_tenant', async (table) => {
		const admin = await createUser(tenant, { role: 'admin' });
		await withContext(app, admin.context);
		await app.query('begin');
		await app.query(`select set_config('zeit.purge_tenant', $1, true)`, [tenant]);
		const refused = await app.query(`delete from ${table}`).catch((error) => error);
		await app.query('rollback');
		expect(refused).toMatchObject({ code: '42501' });
	});

	// "hr books flex time" and the "hr manages" policies cover delete, a grant alone would open these
	it.each(['app.flex_bookings', 'app.time_entries', 'app.project_entries'])(
		'ignores zeit.purge_tenant from zeit_app even with a delete grant on %s',
		async (table) => {
			await superuser.query('begin');
			await superuser.query(`grant delete on ${table} to zeit_app`);
			await superuser.query('set local role zeit_app');
			await superuser.query(
				`select set_config('app.tenant_id', $1, true), set_config('app.role', 'admin', true),
					set_config('zeit.purge_tenant', $1, true)`,
				[tenant]
			);
			const refused = await superuser.query(`delete from ${table}`).catch((error) => error);
			await superuser.query('rollback');
			expect(refused).toMatchObject({ code: 'ZT002' });
		}
	);

	it('lets a person acknowledge a vacation notice once and nothing else', async () => {
		await withContext(app, worker.context);
		const first = await app.query('update app.vacation_notices set acknowledged_at = now()');
		expect(first.rowCount).toBe(1);
		const again = await app.query('update app.vacation_notices set acknowledged_at = now()');
		expect(again.rowCount).toBe(0);

		await expect(
			app.query('update app.vacation_notices set remaining_days = 0')
		).rejects.toMatchObject({ code: '42501' });
		await expect(
			superuser.query('delete from app.vacation_notices where tenant_id = $1', [tenant])
		).rejects.toMatchObject({ code: 'ZT002' });
	});

	it('lets leave expire only after a notice', async () => {
		await expect(
			superuser.query(
				`insert into app.vacation_ledger (tenant_id, employee_id, bucket_year, entry_type, days, effective_date)
				 values ($1, $2, 2025, 'expiry', -2, '2026-03-31')`,
				[tenant, worker.employeeId]
			)
		).rejects.toMatchObject({ code: '23514' });
	});

	it('books a key only once, so a job can run twice', async () => {
		const book = () =>
			superuser.query(
				`insert into app.vacation_ledger (tenant_id, employee_id, bucket_year, entry_type, days, effective_date, dedupe_key)
				 values ($1, $2, 2026, 'entitlement', 30, '2026-01-01', $3)`,
				[tenant, worker.employeeId, `entitlement:2026:${worker.employeeId}`]
			);
		await book();
		await expect(book()).rejects.toMatchObject({ code: '23505' });
	});
});

describe('audit trail', () => {
	it('keeps a diff of the changed columns with actor and subject', async () => {
		const hr = await createUser(tenant, { role: 'hr' });
		await withContext(app, hr.context);
		await app.query(`update app.employees set last_name = 'Beispiel' where id = $1`, [
			worker.employeeId
		]);

		const { rows } = await superuser.query(
			`select actor_user_id, actor_role, action, source, subject_employee_id, diff
			   from audit.log
			  where table_name = 'employees' and row_id = $1
			  order by id desc
			  limit 1`,
			[worker.employeeId]
		);
		expect(rows[0]).toEqual({
			actor_user_id: hr.userId,
			actor_role: 'hr',
			action: 'update',
			source: 'trigger',
			subject_employee_id: worker.employeeId,
			diff: { last_name: ['Muster', 'Beispiel'] }
		});
	});

	it('files entries of a person under that person', async () => {
		const { rows } = await superuser.query(
			`select distinct table_name
			   from audit.log
			  where tenant_id = $1 and subject_employee_id = $2
			  order by 1`,
			[tenant, worker.employeeId]
		);
		expect(rows.map((r) => r.table_name)).toEqual([
			'absence_days',
			'absence_requests',
			'contracts',
			'correction_requests',
			'employees',
			'finding_acks',
			'flex_bookings',
			'project_entries',
			'project_members',
			'time_entries',
			'users',
			'vacation_ledger',
			'vacation_notices'
		]);
	});

	it('lets a person read their own trail but not the rest', async () => {
		await withContext(app, worker.context);
		const { rows } = await app.query(
			`select count(*)::int as n,
			        count(*) filter (
			          where subject_employee_id is distinct from $1 and actor_user_id is distinct from $2
			        )::int as foreign
			   from audit.log`,
			[worker.employeeId, worker.userId]
		);
		expect(rows[0].n).toBeGreaterThan(0);
		expect(rows[0].foreign).toBe(0);
	});
});
