import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
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
let admin: Account;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
	tenant = await createTenant();
	admin = await createUser(tenant, { role: 'admin' });
});

describe('privileges', () => {
	it('grants no function to public', async () => {
		const { rows } = await superuser.query(
			`select p.oid::regprocedure::text as name
			   from pg_proc p
			   join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname in ('app', 'auth', 'audit', 'ops')
			    and (p.proacl is null or exists (
			      select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'
			    ))`
		);
		expect(rows).toEqual([]);
	});

	it('gives zeit_app short statement and idle timeouts', async () => {
		const statement = await app.query('show statement_timeout');
		const idle = await app.query('show idle_in_transaction_session_timeout');
		expect(statement.rows[0].statement_timeout).toBe('15s');
		expect(idle.rows[0].idle_in_transaction_session_timeout).toBe('30s');
	});

	it('never lets zeit_app touch kind, slug or expiry of a tenant', async () => {
		await withContext(app, admin.context);
		for (const change of [`kind = 'sandbox'`, `slug = 'woanders'`, `expires_at = now()`]) {
			await expect(app.query(`update app.tenants set ${change}`)).rejects.toMatchObject({
				code: '42501'
			});
		}
		const renamed = await app.query(`update app.tenants set name = 'Steuerbüro Muster'`);
		expect(renamed.rowCount).toBe(1);
	});

	it('takes only the known optional holidays', async () => {
		await withContext(app, admin.context);
		await app.query(`update app.tenants set holiday_options = '{corpus_christi, assumption_day}'`);
		await expect(
			app.query(`update app.tenants set holiday_options = '{christmas_eve}'`)
		).rejects.toMatchObject({ code: '23514' });
	});

	it('never lets zeit_app change an email address', async () => {
		const user = await createUser(tenant);
		await withContext(app, admin.context);
		await expect(
			app.query(`update app.users set email = 'neu@example.test' where id = $1`, [user.userId])
		).rejects.toMatchObject({ code: '42501' });
	});

	it('lets a person change only name and language on their own user', async () => {
		const person = await createPerson(tenant);
		await withContext(app, person.context);
		const renamed = await app.query(
			`update app.users set display_name = 'Erika M.', locale = 'en' where id = $1`,
			[person.userId]
		);
		expect(renamed.rowCount).toBe(1);

		for (const change of [`role = 'admin'`, `status = 'disabled'`, 'employee_id = null']) {
			await expect(
				app.query(`update app.users set ${change} where id = $1`, [person.userId])
			).rejects.toMatchObject({ code: '42501' });
		}
	});

	it('holds admins to the same rule on their own row but not on others', async () => {
		const other = await createUser(tenant);
		await withContext(app, admin.context);
		await expect(
			app.query(`update app.users set role = 'hr' where id = $1`, [admin.userId])
		).rejects.toMatchObject({ code: '42501' });
		const promoted = await app.query(`update app.users set role = 'hr' where id = $1`, [
			other.userId
		]);
		expect(promoted.rowCount).toBe(1);
	});

	it('links a user only to an employee of the same tenant', async () => {
		const elsewhere = await insertId(
			superuser,
			`insert into app.employees (tenant_id, personnel_no, first_name, last_name, entry_date)
			 values ($1, '9001', 'Max', 'Fremd', '2025-01-01') returning id`,
			[await createTenant()]
		);
		const user = await createUser(tenant);
		await withContext(app, admin.context);
		await expect(
			app.query('update app.users set employee_id = $2 where id = $1', [user.userId, elsewhere])
		).rejects.toMatchObject({ code: '23503' });
	});
});

describe('display names', () => {
	it('resolves names inside the own tenant only', async () => {
		const colleague = await createUser(tenant);
		const stranger = await createUser(await createTenant());
		const person = await createPerson(tenant);
		await withContext(app, person.context);
		const { rows } = await app.query('select id, display_name from app.display_names($1)', [
			[colleague.userId, stranger.userId]
		]);
		expect(rows).toEqual([{ id: colleague.userId, display_name: 'Erika Muster' }]);
	});
});

describe('team calendar', () => {
	let calendarTenant: string;
	let team: string;
	let otherTeam: string;
	let lead: Person;
	let member: Person;
	let hr: Account;

	async function absence(person: Person, type: string, date: string) {
		const request = await insertId(
			superuser,
			`insert into app.absence_requests (tenant_id, employee_id, type, start_date, end_date, status, requested_by)
			 values ($1, $2, $3, $4, $4, 'pending', $5) returning id`,
			[calendarTenant, person.employeeId, type, date, person.userId]
		);
		await superuser.query(
			`insert into app.absence_days (tenant_id, employee_id, absence_id, date, portion, target_minutes)
			 values ($1, $2, $3, $4, 1, 480)`,
			[calendarTenant, person.employeeId, request, date]
		);
	}

	function calendar(teamId: string, from = '2026-05-01', to = '2026-05-31') {
		return app.query(
			`select display_name, date::text, portion::text, type, status
			   from app.team_absence_days($1, $2, $3)`,
			[from, to, teamId]
		);
	}

	beforeAll(async () => {
		calendarTenant = await createTenant();
		team = await createTeam(calendarTenant);
		otherTeam = await createTeam(calendarTenant, 'Lohn');
		lead = await createPerson(calendarTenant, { role: 'team_lead', teamId: team, leads: team });
		member = await createPerson(calendarTenant, { teamId: team });
		const outsider = await createPerson(calendarTenant, { teamId: otherTeam });
		hr = await createUser(calendarTenant, { role: 'hr' });
		await superuser.query(
			`update app.employees set first_name = 'Lena', last_name = 'Leitung' where id = $1`,
			[lead.employeeId]
		);
		await absence(member, 'sick', '2026-05-12');
		await absence(lead, 'vacation', '2026-05-13');
		await absence(outsider, 'vacation', '2026-05-12');
	});

	it('tells colleagues that someone is away, not why', async () => {
		await withContext(app, member.context);
		const { rows } = await calendar(team);
		expect(rows).toEqual([
			{
				display_name: 'Lena Leitung',
				date: '2026-05-13',
				portion: '1.0',
				type: null,
				status: null
			},
			{ display_name: 'Erika Muster', date: '2026-05-12', portion: '1.0', type: null, status: null }
		]);
	});

	it('tells the lead of the team and hr the type', async () => {
		await withContext(app, lead.context);
		expect((await calendar(team)).rows.map((r) => r.type)).toEqual(['vacation', 'sick']);

		await withContext(app, hr.context);
		expect((await calendar(otherTeam)).rows).toEqual([
			{
				display_name: 'Erika Muster',
				date: '2026-05-12',
				portion: '1.0',
				type: 'vacation',
				status: 'pending'
			}
		]);
	});

	it('keeps other teams closed to members and leads', async () => {
		await withContext(app, member.context);
		await expect(calendar(otherTeam)).rejects.toMatchObject({ code: '42501' });
		await withContext(app, lead.context);
		await expect(calendar(otherTeam)).rejects.toMatchObject({ code: '42501' });
	});

	it('keeps the teams of another tenant closed', async () => {
		await withContext(app, admin.context);
		await expect(calendar(team)).rejects.toMatchObject({ code: '42501' });
	});

	it('spans at most 62 days', async () => {
		await withContext(app, hr.context);
		await expect(calendar(team, '2026-05-01', '2026-07-01')).resolves.toBeTruthy();
		await expect(calendar(team, '2026-05-01', '2026-07-02')).rejects.toMatchObject({
			code: '22023'
		});
		await expect(calendar(team, '2026-05-31', '2026-05-01')).rejects.toMatchObject({
			code: '22023'
		});
	});
});
