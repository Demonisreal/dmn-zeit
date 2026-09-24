import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hasRole } from '@zeit/shared';
import type {
	ApiError,
	CreateUserInput,
	Locale,
	UpdateMeInput,
	UpdateUserInput,
	User
} from '@zeit/shared';
import { sql, type Selectable } from 'kysely';
import { hashToken, newToken } from '../auth/tokens';
import { Audit } from '../common/audit';
import type { Client } from '../common/client.decorator';
import type { AuthSession } from '../common/session.guard';
import type { Config } from '../config';
import { Database, type Trx } from '../db/database';
import type { AppUsers } from '../db/schema.generated';
import { MailQueue } from '../mail/mail.queue';
import { MailTransport } from '../mail/mail.transport';
import { invitationMail } from '../mail/templates';

function toUser(row: Selectable<AppUsers>): User {
	return {
		id: row.id,
		email: row.email,
		displayName: row.display_name,
		role: row.role,
		locale: row.locale as Locale,
		status: row.status,
		employeeId: row.employee_id,
		lastLoginAt: row.last_login_at
	};
}

async function endSessions(trx: Trx, userId: string): Promise<void> {
	await sql`select auth.session_revoke_all(${userId})`.execute(trx);
}

// app.leads asks team_leads only, not the role, a row left behind keeps the team readable
async function dropLeads(trx: Trx, userId: string): Promise<void> {
	await trx.deleteFrom('app.team_leads').where('user_id', '=', userId).execute();
}

@Injectable()
export class UsersService {
	private readonly origin: string;

	constructor(
		private readonly db: Database,
		private readonly mail: MailTransport,
		private readonly queue: MailQueue,
		private readonly audit: Audit,
		config: ConfigService<Config, true>
	) {
		this.origin = config.get('APP_ORIGIN', { infer: true });
	}

	async list(admin: AuthSession): Promise<User[]> {
		const rows = await this.db.withTenant(admin, (trx) =>
			trx.selectFrom('app.users').selectAll().orderBy('display_name').execute()
		);
		return rows.map(toUser);
	}

	// the account waits as invited until the link from the mail sets its password
	async create(admin: AuthSession, input: CreateUserInput, client: Client): Promise<User> {
		const token = newToken();
		const { user, tenant } = await this.db.withTenant(admin, async (trx) => {
			const row = await trx
				.insertInto('app.users')
				.values({
					tenant_id: admin.tenantId,
					email: input.email,
					display_name: input.displayName,
					role: input.role,
					locale: input.locale,
					employee_id: input.employeeId
				})
				.returningAll()
				.executeTakeFirstOrThrow();
			await this.issueInvite(trx, row.id, token);
			return { user: toUser(row), tenant: await this.tenantName(trx, admin) };
		});

		await this.sendInvitation(admin, user, tenant, token, client);
		return user;
	}

	// a fresh link, the one from the previous mail stops working
	async invite(admin: AuthSession, userId: string, client: Client): Promise<void> {
		const token = newToken();
		const { user, tenant } = await this.db.withTenant(admin, async (trx) => {
			const row = await trx
				.selectFrom('app.users')
				.selectAll()
				.where('id', '=', userId)
				.executeTakeFirst();
			if (!row) throw new NotFoundException('User not found');
			if (row.status !== 'invited') {
				throw new ConflictException({
					code: 'INVALID_STATE',
					message: 'Only a user who has not accepted yet can be invited again',
					details: null
				} satisfies ApiError);
			}
			await this.issueInvite(trx, userId, token);
			return { user: toUser(row), tenant: await this.tenantName(trx, admin) };
		});

		await this.sendInvitation(admin, user, tenant, token, client);
	}

	update(admin: AuthSession, userId: string, input: UpdateUserInput): Promise<User> {
		return this.db.withTenant(admin, async (trx) => {
			const before = await trx
				.selectFrom('app.users')
				.selectAll()
				.where('id', '=', userId)
				.forUpdate()
				.executeTakeFirst();
			if (!before) throw new NotFoundException('User not found');
			if (Object.keys(input).length === 0) return toUser(before);

			// guard_own_user refuses role and employee changes on the own row, admins included
			const row = await trx
				.updateTable('app.users')
				.set({
					display_name: input.displayName,
					role: input.role,
					locale: input.locale,
					employee_id: input.employeeId
				})
				.where('id', '=', userId)
				.returningAll()
				.executeTakeFirstOrThrow();

			if (!hasRole(row.role, 'team_lead')) {
				await dropLeads(trx, userId);
			}
			if (row.role !== before.role || row.employee_id !== before.employee_id) {
				await endSessions(trx, userId);
			}
			return toUser(row);
		});
	}

	// a second click finds the account already in that state and changes nothing
	private setStatus(
		admin: AuthSession,
		userId: string,
		status: 'active' | 'disabled'
	): Promise<User> {
		return this.db.withTenant(admin, async (trx) => {
			const before = await trx
				.selectFrom('app.users')
				.selectAll()
				.where('id', '=', userId)
				.forUpdate()
				.executeTakeFirst();
			if (!before) throw new NotFoundException('User not found');
			if (before.status === status) return toUser(before);
			// an invitation turns active by choosing a password, not by being enabled
			if (status === 'active' && before.status !== 'disabled') {
				throw new ConflictException({
					code: 'INVALID_STATE',
					message: 'Only a disabled user can be enabled again',
					details: null
				} satisfies ApiError);
			}

			// guard_own_user refuses a status change on the own row, admins included
			const row = await trx
				.updateTable('app.users')
				.set({ status })
				.where('id', '=', userId)
				.returningAll()
				.executeTakeFirstOrThrow();

			if (status === 'disabled') await dropLeads(trx, userId);
			await endSessions(trx, userId);
			return toUser(row);
		});
	}

	disable(admin: AuthSession, userId: string): Promise<User> {
		return this.setStatus(admin, userId, 'disabled');
	}

	enable(admin: AuthSession, userId: string): Promise<User> {
		return this.setStatus(admin, userId, 'active');
	}

	async me(session: AuthSession): Promise<User> {
		const row = await this.db.withTenant(session, (trx) =>
			trx
				.selectFrom('app.users')
				.selectAll()
				.where('id', '=', session.userId)
				.executeTakeFirstOrThrow()
		);
		return toUser(row);
	}

	async updateMe(session: AuthSession, input: UpdateMeInput): Promise<User> {
		if (Object.keys(input).length === 0) return this.me(session);

		const row = await this.db.withTenant(session, (trx) =>
			trx
				.updateTable('app.users')
				.set({ display_name: input.displayName, locale: input.locale })
				.where('id', '=', session.userId)
				.returningAll()
				.executeTakeFirstOrThrow()
		);
		return toUser(row);
	}

	// seven days, the database sets the lifetime
	private async issueInvite(trx: Trx, userId: string, token: string): Promise<void> {
		await sql`select auth.token_issue(${userId}, 'invite'::auth.token_kind, ${hashToken(token)})`.execute(
			trx
		);
	}

	private async tenantName(trx: Trx, admin: AuthSession): Promise<string> {
		const { name } = await trx
			.selectFrom('app.tenants')
			.select('name')
			.where('id', '=', admin.tenantId)
			.executeTakeFirstOrThrow();
		return name;
	}

	private async sendInvitation(
		admin: AuthSession,
		user: User,
		tenant: string,
		token: string,
		client: Client
	): Promise<void> {
		await this.audit.record({
			tenantId: admin.tenantId,
			userId: user.id,
			employeeId: user.employeeId,
			actor: { userId: admin.userId, role: admin.role },
			action: 'user.invited',
			client
		});
		this.queue.later(() =>
			this.mail.send({
				tenantId: admin.tenantId,
				to: user.email,
				...invitationMail(user.locale, {
					name: user.displayName,
					tenant,
					link: `${this.origin}/invite#t=${token}`
				})
			})
		);
	}
}
