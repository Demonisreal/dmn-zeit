import { Injectable } from '@nestjs/common';
import type { DemoPlan } from '@zeit/demo-data';
import type { Locale, OutboxMail, Persona } from '@zeit/shared';
import { sql } from 'kysely';
import { Database, type Trx } from '../db/database';

export type Attempt = { window: 'hour' | 'day'; hits: number; retryAfter: number };

@Injectable()
export class DemoStore {
	constructor(private readonly db: Database) {}

	// zeit_app only sees its own tenant, the definer function counts all of them
	async activeSandboxes(): Promise<number> {
		const { rows } = await sql<{ count: number }>`
			select count(*)::int as count from ops.active_tenants() where kind = 'sandbox'`.execute(this.db);
		return rows[0]!.count;
	}

	// fixed windows opened by the first attempt, the day window ends at midnight with the address salt
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

	// one statement is its own transaction, a seed failing halfway leaves no sandbox behind
	async write(plan: DemoPlan, locale: Locale): Promise<void> {
		await sql`select ops.sandbox_seed(${JSON.stringify(plan)}::jsonb, ${locale})`.execute(this.db);
	}

	// everyone ops.demo_switch_persona would switch to
	async personas(trx: Trx, userId: string): Promise<Persona[]> {
		const rows = await trx
			.selectFrom('app.users as u')
			.innerJoin('app.tenants as t', 't.id', 'u.tenant_id')
			.leftJoin('app.employees as e', 'e.id', 'u.employee_id')
			.leftJoin('app.teams as tm', 'tm.id', 'e.team_id')
			.select([
				'u.id',
				'u.display_name',
				'u.role',
				'e.id as employee_id',
				sql<string>`e.first_name || ' ' || e.last_name`.as('employee_name'),
				'tm.id as team_id',
				'tm.name as team_name',
				't.workspace'
			])
			.where('t.kind', '=', 'sandbox')
			.where('u.status', 'in', ['active', 'demo'])
			// the enum runs up the role ladder
			.orderBy('u.role')
			.orderBy('u.display_name')
			.execute();

		return rows.map((row) => ({
			userId: row.id,
			displayName: row.display_name,
			role: row.role,
			employee: row.employee_id ? { id: row.employee_id, name: row.employee_name } : null,
			team: row.team_id ? { id: row.team_id, name: row.team_name! } : null,
			workspace: row.workspace,
			current: row.id === userId
		}));
	}

	// false when the session is gone, the sandbox expired or the person belongs to another one
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
