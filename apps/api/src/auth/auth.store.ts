import { Injectable } from '@nestjs/common';
import type { ActiveSession, Locale, Role, Session, WorkspaceKind } from '@zeit/shared';
import { sql } from 'kysely';
import { Database, type TenantContext } from '../db/database';

export type TokenKind = 'invite' | 'password_reset';

export type Credential = {
	userId: string;
	tenantId: string;
	role: Role;
	passwordHash: string | null;
	lockedUntil: string | null;
};

export type SessionRow = {
	id: string;
	userId: string;
	tenantId: string;
	role: Role;
	workspace: WorkspaceKind;
	employeeId: string | null;
	csrfHash: Buffer;
	enrollmentPending: boolean;
	reauthUntil: string | null;
};

export type TokenOwner = {
	userId: string;
	email: string;
	displayName: string;
	tenantName: string;
	expiresAt: string;
};

export type Profile = Pick<Session, 'user' | 'tenant' | 'leadsTeams'>;

export type NewSession = {
	tokenHash: Buffer;
	csrfHash: Buffer;
	ip: string | null;
	userAgent: string | null;
};

type UserContext = TenantContext & { userId: string };

// zeit_app has no grant on the auth tables, everything goes through the security definer functions
@Injectable()
export class AuthStore {
	constructor(private readonly db: Database) {}

	async credential(email: string): Promise<Credential | undefined> {
		const { rows } = await sql<Credential>`
			select user_id as "userId", tenant_id as "tenantId", role,
				password_hash as "passwordHash", locked_until as "lockedUntil"
			from auth.login_lookup(${email})`.execute(this.db);
		return rows[0];
	}

	async loginFailed(userId: string): Promise<void> {
		await sql`select auth.login_failed(${userId})`.execute(this.db);
	}

	// swaps the hash only while it is still the one that was checked, every session stays
	async rehash(userId: string, oldHash: string, newHash: string): Promise<void> {
		await sql`select auth.password_rehash(${userId}, ${oldHash}, ${newHash})`.execute(this.db);
	}

	// someone else in the tenant, as an admin sees them
	async person(
		ctx: TenantContext,
		userId: string
	): Promise<
		{ email: string; displayName: string; locale: Locale; employeeId: string | null } | undefined
	> {
		const row = await this.db.withTenant(ctx, (trx) =>
			trx
				.selectFrom('app.users')
				.select(['email', 'display_name', 'locale', 'employee_id'])
				.where('id', '=', userId)
				.executeTakeFirst()
		);
		return (
			row && {
				email: row.email,
				displayName: row.display_name,
				locale: row.locale as Locale,
				employeeId: row.employee_id
			}
		);
	}

	async createSession(userId: string, session: NewSession, bypassLock = false): Promise<void> {
		await sql`select auth.session_create(${userId}, ${session.tokenHash}, ${session.csrfHash},
			${session.ip}::inet, ${session.userAgent}, ${bypassLock})`.execute(this.db);
	}

	async resolveSession(tokenHash: Buffer): Promise<SessionRow | undefined> {
		// a confirmation with password and second factor holds for ten minutes
		const { rows } = await sql<SessionRow>`
			select session_id as id, user_id as "userId", tenant_id as "tenantId", role, workspace,
				employee_id as "employeeId", csrf_hash as "csrfHash",
				enrollment_pending as "enrollmentPending",
				case when reauth_at > now() - interval '10 minutes'
					then reauth_at + interval '10 minutes' end as "reauthUntil"
			from auth.session_resolve(${tokenHash})`.execute(this.db);
		return rows[0];
	}

	async revokeSession(userId: string, sessionId: string): Promise<boolean> {
		const { rows } = await sql<{ revoked: boolean }>`
			select auth.session_revoke_by_id(${userId}, ${sessionId}) as revoked`.execute(this.db);
		return rows[0]?.revoked === true;
	}

	async sessions(userId: string): Promise<Omit<ActiveSession, 'current'>[]> {
		const { rows } = await sql<Omit<ActiveSession, 'current'>>`
			select id, created_at as "createdAt", last_seen_at as "lastSeenAt", host(ip) as ip,
				user_agent as "userAgent"
			from auth.sessions_list(${userId})
			order by last_seen_at desc`.execute(this.db);
		return rows;
	}

	profile(ctx: UserContext): Promise<Profile> {
		return this.db.withTenant(ctx, async (trx) => {
			const row = await trx
				.selectFrom('app.users as u')
				.innerJoin('app.tenants as t', 't.id', 'u.tenant_id')
				.select([
					'u.id',
					'u.email',
					'u.display_name',
					'u.role',
					'u.locale',
					'u.status',
					'u.employee_id',
					'u.last_login_at',
					't.id as tenant_id',
					't.name as tenant_name',
					't.kind as tenant_kind',
					't.workspace as tenant_workspace',
					't.expires_at as tenant_expires_at'
				])
				.where('u.id', '=', ctx.userId)
				.executeTakeFirstOrThrow();

			const leadsTeams = await trx
				.selectFrom('app.team_leads as l')
				.innerJoin('app.teams as t', 't.id', 'l.team_id')
				.select(['t.id', 't.name'])
				.where('l.user_id', '=', ctx.userId)
				.orderBy('t.name')
				.execute();

			return {
				user: {
					id: row.id,
					email: row.email,
					displayName: row.display_name,
					role: row.role,
					locale: row.locale as Locale,
					status: row.status,
					employeeId: row.employee_id,
					lastLoginAt: row.last_login_at
				},
				tenant: {
					id: row.tenant_id,
					name: row.tenant_name,
					kind: row.tenant_kind,
					workspace: row.tenant_workspace,
					expiresAt: row.tenant_expires_at
				},
				leadsTeams
			};
		});
	}

	// the lifetime comes from the database: 7 days for invitations, 30 minutes for resets
	async issueToken(userId: string, kind: TokenKind, tokenHash: Buffer): Promise<void> {
		await sql`select auth.token_issue(${userId}, ${kind}::auth.token_kind, ${tokenHash})`.execute(
			this.db
		);
	}

	async inspectToken(tokenHash: Buffer, kind: TokenKind): Promise<TokenOwner | undefined> {
		const { rows } = await sql<TokenOwner>`
			select user_id as "userId", email, display_name as "displayName",
				tenant_name as "tenantName", expires_at as "expiresAt"
			from auth.token_inspect(${tokenHash}, ${kind}::auth.token_kind)`.execute(this.db);
		return rows[0];
	}

	// token, new password and the end of every session in one statement
	async resetPassword(tokenHash: Buffer, passwordHash: string): Promise<string | null> {
		const { rows } = await sql<{ userId: string | null }>`
			select auth.password_reset(${tokenHash}, ${passwordHash}) as "userId"`.execute(this.db);
		return rows[0]?.userId ?? null;
	}

	acceptInvitation(
		requestId: string,
		tokenHash: Buffer,
		passwordHash: string
	): Promise<string | null> {
		return this.db.transaction().execute(async (trx) => {
			await sql`select set_config('app.request_id', ${requestId}, true)`.execute(trx);
			const { rows } = await sql<{ userId: string | null }>`
				select auth.invitation_accept(${tokenHash}, ${passwordHash}) as "userId"`.execute(trx);
			return rows[0]?.userId ?? null;
		});
	}

	// ends every session of the person, this one included
	changePassword(ctx: UserContext, passwordHash: string): Promise<void> {
		return this.db.withTenant(ctx, async (trx) => {
			await sql`select auth.password_change(${passwordHash})`.execute(trx);
		});
	}
}
