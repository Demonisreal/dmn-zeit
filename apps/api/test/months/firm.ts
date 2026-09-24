import type { AbsenceType, Role } from '@zeit/shared';
import type { Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { createContract, createPerson, createUser, insertId, type Person } from '../helpers/pg';

export type Hire = Person & { desk: Desk; name: string };
export type Seat = { userId: string; desk: Desk };

type HireOptions = {
	role?: Role;
	teamId?: string | null;
	leads?: string;
	entryDate?: string;
	personnelNo?: string;
};

// named, with a five-day contract from the entry date, and signed in
export async function hire(
	api: Api,
	tenantId: string,
	name: string,
	options: HireOptions = {}
): Promise<Hire> {
	const person = await createPerson(tenantId, options);
	const [first, last] = name.split(' ');
	await api.superuser.query(
		`update app.employees set first_name = $2, last_name = $3, personnel_no = coalesce($4, personnel_no)
		 where id = $1`,
		[person.employeeId, first, last, options.personnelNo ?? null]
	);
	await createContract(tenantId, person.employeeId);
	return { ...person, name, desk: await signedIn(api, person.userId) };
}

// an account without a personnel record, the usual hr or admin login
export async function seat(
	api: Api,
	tenantId: string,
	role: Role,
	options: { name?: string; locale?: 'de' | 'en'; reauth?: boolean } = {}
): Promise<Seat> {
	const { userId } = await createUser(tenantId, { role });
	await api.superuser.query('update app.users set display_name = $2, locale = $3 where id = $1', [
		userId,
		options.name ?? 'Erika Muster',
		options.locale ?? 'de'
	]);
	return { userId, desk: await signedIn(api, userId, { reauth: options.reauth ?? false }) };
}

export function book(api: Api, person: Person, minutes: number, date: string) {
	return api.superuser.query(
		`insert into app.flex_bookings (tenant_id, employee_id, type, minutes, effective_date, reason)
		 values ($1, $2, 'manual', $3, $4, 'Überstunden aus dem Vormonat nachgetragen')`,
		[person.context.tenantId, person.employeeId, minutes, date]
	);
}

// one approved day, decided by someone else; sick notes need no decision
export async function absentOn(
	api: Api,
	person: Person,
	type: AbsenceType,
	date: string,
	decidedBy: string
) {
	const id = await insertId(
		api.superuser,
		`insert into app.absence_requests (tenant_id, employee_id, type, start_date, end_date, status, requested_by)
		 values ($1, $2, $3::app.absence_type, $4, $4,
			case when $3::app.absence_type = 'sick' then 'approved' else 'pending' end::app.absence_status, $5)
		 returning id`,
		[person.context.tenantId, person.employeeId, type, date, person.userId]
	);
	await api.superuser.query(
		`insert into app.absence_days (tenant_id, employee_id, absence_id, date, portion, target_minutes, vacation_days)
		 values ($1, $2, $3, $4, 1, 480, case when $5 = 'vacation' then 1 else 0 end)`,
		[person.context.tenantId, person.employeeId, id, date, type]
	);
	if (type !== 'sick') {
		await api.superuser.query(
			`update app.absence_requests set status = 'approved', decided_by = $2, decided_at = now()
			 where id = $1`,
			[id, decidedBy]
		);
	}
	return id;
}

export async function closedThrough(api: Api, employeeId: string) {
	const { rows } = await api.superuser.query<{ through: string | null }>(
		'select closed_through::text as through from app.employees where id = $1',
		[employeeId]
	);
	return rows[0]!.through;
}

export const currentMonth = () =>
	new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date()).slice(0, 7);
