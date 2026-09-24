import type { Role } from '@zeit/shared';
import { vi } from 'vitest';
import { Clock } from '../../src/common/clock';
import type { Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { createContract, createPerson, createTeam, createTenant, type Person } from '../helpers/pg';

export type Member = Person & { desk: Desk; name: string };

type Options = { role?: Role; teamId?: string | null; leads?: string };

// named, with a five-day contract of 30 leave days since 2025, and signed in
export async function member(
	api: Api,
	tenantId: string,
	name: string,
	options: Options = {}
): Promise<Member> {
	const person = await createPerson(tenantId, options);
	const [first, last] = name.split(' ');
	await api.superuser.query(
		'update app.employees set first_name = $2, last_name = $3 where id = $1',
		[person.employeeId, first, last]
	);
	await api.superuser.query('update app.users set display_name = $2 where id = $1', [
		person.userId,
		name
	]);
	await createContract(tenantId, person.employeeId);
	return { ...person, name, desk: await signedIn(api, person.userId) };
}

// one team with its lead and two members, somebody from another team, and hr
export async function office(api: Api) {
	const tenantId = await createTenant();
	const team = await createTeam(tenantId);
	const otherTeam = await createTeam(tenantId, 'Lohn');
	return {
		tenantId,
		team,
		otherTeam,
		lead: await member(api, tenantId, 'Lena Leitung', {
			role: 'team_lead',
			teamId: team,
			leads: team
		}),
		worker: await member(api, tenantId, 'Wim Werner', { teamId: team }),
		colleague: await member(api, tenantId, 'Clara Kolleg', { teamId: team }),
		outsider: await member(api, tenantId, 'Otto Aussen', { teamId: otherTeam }),
		hr: await member(api, tenantId, 'Hanna Personal', { role: 'hr' })
	};
}

export type Office = Awaited<ReturnType<typeof office>>;

export function grant(api: Api, person: Person, year: number, days: string) {
	return api.superuser.query(
		`insert into app.vacation_ledger (tenant_id, employee_id, bucket_year, entry_type, days, effective_date)
		 values ($1, $2, $3, 'entitlement', $4, $5)`,
		[person.context.tenantId, person.employeeId, year, days, `${year}-01-01`]
	);
}

// the rules' "today"; the database keeps its own clock for stamps and closings
export function today(api: Api, instant: string) {
	vi.spyOn(api.app.get(Clock), 'now').mockReturnValue(new Date(instant));
}

export async function ledger(api: Api, person: Person) {
	const { rows } = await api.superuser.query<{
		bucket_year: number;
		entry_type: string;
		days: string;
		effective_date: string;
		absence_id: string | null;
	}>(
		`select bucket_year, entry_type::text, days::text, effective_date::text, absence_id
		   from app.vacation_ledger where employee_id = $1 and entry_type <> 'entitlement'
		  order by created_at, bucket_year`,
		[person.employeeId]
	);
	return rows;
}

export function closeMonth(api: Api, tenantId: string, month: string, userId: string) {
	return api.superuser.query(
		`insert into app.month_closings (tenant_id, month, action, created_by) values ($1, $2, 'close', $3)`,
		[tenantId, month, userId]
	);
}
