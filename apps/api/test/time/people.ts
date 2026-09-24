import { ConfigService } from '@nestjs/config';
import { hashPassword } from '../../src/auth/passwords';
import { PASSWORD, type Api, type Browser } from '../auth/api';
import { insertId, type Account, type Person } from '../helpers/pg';

let passwordHash: Promise<string> | undefined;

// the second factor has tests of its own, here a session goes straight past the enrollment step
export async function signedIn<T extends Account>(
	api: Api,
	account: T
): Promise<T & { browser: Browser }> {
	passwordHash ??= hashPassword(
		PASSWORD,
		api.app.get(ConfigService).get<Buffer>('PASSWORD_PEPPER')!
	);
	await api.superuser.query(
		'insert into auth.credentials (user_id, password_hash) values ($1, $2)',
		[account.userId, await passwordHash]
	);
	const { rows } = await api.superuser.query<{ email: string }>(
		'select email from app.users where id = $1',
		[account.userId]
	);
	const browser = api.browser();
	await browser.signIn(rows[0]!.email);
	await api.superuser.query(
		'update auth.sessions set enrollment_pending = false where user_id = $1',
		[account.userId]
	);
	return { ...account, browser };
}

export function addEntry(api: Api, person: Person, startedAt: string, endedAt: string | null) {
	return insertId(
		api.superuser,
		`insert into app.time_entries (tenant_id, employee_id, started_at, ended_at, source)
		 values ($1, $2, $3, $4, 'seed') returning id`,
		[person.context.tenantId, person.employeeId, startedAt, endedAt]
	);
}

// the first closing of a tenant may pick any past month, it locks everyone up to its end
export async function closeMonth(api: Api, tenantId: string, month: string, hrUserId: string) {
	await api.superuser.query(
		`insert into app.month_closings (tenant_id, month, action, created_by)
		 values ($1, $2, 'close', $3)`,
		[tenantId, month, hrUserId]
	);
}
