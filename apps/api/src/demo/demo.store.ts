import { Injectable } from '@nestjs/common';
import type { DemoPlan } from '@zeit/demo-data';
import type { Locale, OutboxMail, Persona, Role, WorkspaceKind } from '@zeit/shared';
import { sql } from 'kysely';
import { Database, type Trx } from '../db/database';

export type Attempt = { window: 'hour' | 'day'; hits: number; retryAfter: number };

@Injectable()
export class DemoStore {
	constructor(private readonly db: Database) {}

	async activeSandboxes(): Promise<number> {
		const { rows } = await sql<{ count: number }>`
			select count(*)::int as count from ops.active_tenants()
			 where kind = 'sandbox' and workspace = 'company'`.execute(this.db);
		return rows[0]!.count;
	}

	async countAttempt(address: string): Promise<Attempt[]> {
		const { rows } = await sql<Attempt>`
			insert into ops.rate_limits as r (key, hits, expires_at)
			values (${`demo-sandbox:hour:${address}`}, 1, now() + interval '1 hour'),
				(${`demo-sandbox:day:${address}`}, 1,
					((now() at time zone 'Europe/Berlin')::date + 1)::timestamp at time zone 'Europe/Berlin')
			on conflict (key) do update
				set hits = case when r.expires_at > now() then r.hits + 1 else 1 end,
					expires_at = case when r.expires_at > now() then r.expires_at else excluded.expires_at end
			returning split_part(r.key, ':', 2) as "window", r.hits,
				ceil(extract(epoch from r.expires_at - now()))::int as "retryAfter"`.execute(this.db);
		return rows;
	}

	async countOpened(): Promise<Omit<Attempt, 'window'>> {
		const { rows } = await sql<Omit<Attempt, 'window'>>`
			insert into ops.rate_limits as r (key, hits, expires_at)
			values ('demo-sandbox:opened', 1, now() + interval '1 hour')
			on conflict (key) do update
				set hits = case when r.expires_at > now() then r.hits + 1 else 1 end,
					expires_at = case when r.expires_at > now() then r.expires_at else excluded.expires_at end
			returning r.hits, ceil(extract(epoch from r.expires_at - now()))::int as "retryAfter"`.execute(
			this.db
		);
		return rows[0]!;
	}

	async write(plan: DemoPlan, locale: Locale): Promise<void> {
		await sql`select ops.sandbox_seed(${JSON.stringify(plan)}::jsonb, ${locale})`.execute(this.db);
	}

	async personas(trx: Trx, userId: string): Promise<Persona[]> {
		const { rows } = await sql<{
			user_id: string;
			display_name: string;
			role: Role;
			employee_id: string | null;
			employee_name: string | null;
			team_id: string | null;
			team_name: string | null;
			workspace: WorkspaceKind;
		}>`select * from ops.demo_personas()`.execute(trx);

		return rows.map((row) => ({
			userId: row.user_id,
			displayName: row.display_name,
			role: row.role,
			employee: row.employee_id ? { id: row.employee_id, name: row.employee_name! } : null,
			team: row.team_id ? { id: row.team_id, name: row.team_name! } : null,
			workspace: row.workspace,
			current: row.user_id === userId
		}));
	}

	async switchPersona(
		sessionHash: Buffer,
		userId: string,
		tokenHash: Buffer,
		csrfHash: Buffer
	): Promise<boolean> {
		const { rows } = await sql<{ id: string | null }>`
			select ops.demo_switch_persona(${sessionHash}, ${userId}, ${tokenHash}, ${csrfHash}) as id`.execute(
			this.db
		);
		return rows[0]!.id !== null;
	}

	outbox(trx: Trx): Promise<OutboxMail[]> {
		return trx
			.selectFrom('ops.demo_outbox')
			.select(['id', 'recipient as to', 'subject', 'body as text', 'created_at as createdAt'])
			.orderBy('created_at', 'desc')
			.execute();
	}
}
