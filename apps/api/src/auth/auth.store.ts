import { Injectable } from '@nestjs/common';
import type { ActiveSession, Locale, Role, Session } from '@zeit/shared';
import { sql } from 'kysely';
import { Database, type TenantContext } from '../db/database';

export type TokenKind = 'invite' | 'password_reset';

export type Credential = {
	userId: string;
	tenantId: string;
	role: Role;
	status: 'active' | 'invited';
	passwordHash: string | null;
	lockedUntil: string | null;
};

export type SessionRow = {
	id: string;
	userId: string;
	tenantId: string;
	role: Role;
	employeeId: string | null;
	csrfHash: Buffer;
};

export type TokenOwner = {
	userId: string;
	email: string;
	displayName: string;
	tenantName: string;
	expiresAt: string;
};

export type Profile = Omit<Session, 'csrfToken'>;

export type NewSession = {
	tokenHash: Buffer;
	csrfHash: Buffer;
	ip: string | null;
	userAgent: string | null;
};

// zeit_app has no grant on the auth tables, everything goes through the security definer functions
@Injectable()
export class AuthStore {
	constructor(private readonly db: Database) {}

	async credential(email: string): Promise<Credential | undefined> {
		const { rows } = await sql<Credential>`
			select user_id as "userId", tenant_id as "tenantId", role, status,
				password_hash as "passwordHash", locked_until as "lockedUntil"
			from auth.login_lookup(${email})`.execute(this.db);
		return rows[0];
	}

	async loginFailed(userId: string): Promise<void> {
		await sql`select auth.login_failed(${userId})`.execute(this.db);
	}

	async setPassword(userId: string, passwordHash: string): Promise<void> {
		await sql`select auth.password_set(${userId}, ${passwordHash})`.execute(this.db);
	}

	async createSession(userId: string, session: NewSession): Promise<void> {
		await sql`select auth.session_create(${userId}, ${session.tokenHash}, ${session.csrfHash},
			${session.ip}::inet, ${session.userAgent})`.execute(this.db);
	}

	async resolveSession(tokenHash: Buffer): Promise<SessionRow | undefined> {
		const { rows } = await sql<SessionRow>`
			select session_id as id, user_id as "userId", tenant_id as "tenantId", role,
				employee_id as "employeeId", csrf_hash as "csrfHash"
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

	profile(ctx: TenantContext & { userId: string }): Promise<Profile> {
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
					't.expires_at as tenant_expires_at'
				])
				.where('u.id', '=', ctx.userId)
				.executeTakeFirstOrThrow();

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
					expiresAt: row.tenant_expires_at
				}
			};
		});
	}

	async issueToken(userId: string, kind: TokenKind, tokenHash: Buffer, ttl: string): Promise<void> {
		await sql`select auth.token_issue(${userId}, ${kind}::auth.token_kind, ${tokenHash},
			${ttl}::interval)`.execute(this.db);
	}

	async inspectToken(tokenHash: Buffer, kind: TokenKind): Promise<TokenOwner | undefined> {
		const { rows } = await sql<TokenOwner>`
			select user_id as "userId", email, display_name as "displayName",
				tenant_name as "tenantName", expires_at as "expiresAt"
			from auth.token_inspect(${tokenHash}, ${kind}::auth.token_kind)`.execute(this.db);
		return rows[0];
	}

	// consuming the token, the new password and the logout everywhere stand or fall together
	resetPassword(tokenHash: Buffer, passwordHash: string): Promise<string | null> {
		return this.db.transaction().execute(async (trx) => {
			const { rows } = await sql<{ userId: string | null }>`
				select auth.token_consume(${tokenHash}, 'password_reset') as "userId"`.execute(trx);
			const userId = rows[0]?.userId ?? null;
			if (!userId) return null;

			await sql`select auth.password_set(${userId}, ${passwordHash})`.execute(trx);
			await sql`select auth.session_revoke_all(${userId})`.execute(trx);
			return userId;
		});
	}

	acceptInvitation(
		requestId: string,
		tokenHash: Buffer,
		passwordHash: string
	): Promise<string | null> {
		return this.db.transaction().execute(async (trx) => {
			const { rows } = await sql<{ userId: string | null }>`
				select auth.token_consume(${tokenHash}, 'invite') as "userId"`.execute(trx);
			const userId = rows[0]?.userId ?? null;
			if (!userId) return null;

			// the status change lands in the trail, with the invited person as its actor
			await sql`select set_config('app.user_id', ${userId}, true),
				set_config('app.request_id', ${requestId}, true)`.execute(trx);
			await sql`select auth.password_set(${userId}, ${passwordHash})`.execute(trx);
			return userId;
		});
	}

	changePassword(userId: string, passwordHash: string): Promise<void> {
		return this.db.transaction().execute(async (trx) => {
			await sql`select auth.password_set(${userId}, ${passwordHash})`.execute(trx);
			await sql`select auth.session_revoke_all(${userId})`.execute(trx);
		});
	}
}
