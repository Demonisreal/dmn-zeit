import { BadRequestException, Injectable } from '@nestjs/common';
import { hasRole, instantSchema } from '@zeit/shared';
import type { ApiError, AuditEntry, AuditPage, AuditQuery, AuditSource } from '@zeit/shared';
import { sql } from 'kysely';
import type { AuthSession } from '../common/session.guard';
import { Database } from '../db/database';

type Position = { at: string; id: string };

// the last entry of a page as "occurredAt,id", the next page starts right behind it
function cursorOf(entry: Position): string {
	return Buffer.from(`${entry.at},${entry.id}`).toString('base64url');
}

function positionOf(cursor: string): Position {
	const [at = '', id = '', ...rest] = Buffer.from(cursor, 'base64url').toString().split(',');
	if (rest.length > 0 || !instantSchema.safeParse(at).success || !/^\d{1,18}$/.test(id)) {
		throw new BadRequestException({
			code: 'VALIDATION',
			message: 'Invalid input',
			details: [{ field: 'cursor', code: 'invalid_format', message: 'Invalid cursor' }]
		} satisfies ApiError);
	}
	return { at, id };
}

@Injectable()
export class AuditService {
	constructor(private readonly db: Database) {}

	page(session: AuthSession, query: AuditQuery): Promise<AuditPage> {
		const after = query.cursor === undefined ? undefined : positionOf(query.cursor);
		// below hr only what is about oneself (art. 15 gdpr); without an employee that is nothing
		const subject = hasRole(session.role, 'hr') ? query.employee : session.employeeId;
		// from and to are whole days in the tenant's zone
		const since = sql<string>`${query.from}::date::timestamp at time zone 'Europe/Berlin'`;
		const until = sql<string>`(${query.to}::date + 1)::timestamp at time zone 'Europe/Berlin'`;

		return this.db.withTenant(session, async (trx) => {
			let entries = trx
				.selectFrom('audit.log')
				.selectAll()
				.where('occurred_at', '>=', since)
				.where('occurred_at', '<', until);
			if (subject !== undefined) entries = entries.where('subject_employee_id', '=', subject);
			if (query.table) entries = entries.where('table_name', '=', query.table);
			if (query.row) entries = entries.where('row_id', '=', query.row);
			if (after) {
				entries = entries.where(
					sql<boolean>`(occurred_at, id) < (${after.at}::timestamptz, ${after.id}::bigint)`
				);
			}

			const rows = await entries
				.orderBy('occurred_at', 'desc')
				.orderBy('id', 'desc')
				.limit(query.limit + 1)
				.execute();
			const page = rows.slice(0, query.limit);

			const actors = [...new Set(page.flatMap((row) => row.actor_user_id ?? []))];
			const { rows: names } = await sql<{ id: string; display_name: string }>`
				select id, display_name from app.display_names(${actors}::uuid[])`.execute(trx);
			const nameOf = new Map(names.map((actor) => [actor.id, actor.display_name]));

			const last = page.at(-1);
			return {
				items: page.map((row): AuditEntry => ({
					id: row.id,
					occurredAt: row.occurred_at,
					actorUserId: row.actor_user_id,
					actorName: (row.actor_user_id && nameOf.get(row.actor_user_id)) ?? null,
					actorRole: row.actor_role,
					source: row.source as AuditSource,
					action: row.action,
					table: row.table_name,
					rowId: row.row_id,
					subjectEmployeeId: row.subject_employee_id,
					diff: row.diff as AuditEntry['diff'],
					requestId: row.request_id,
					ip: row.ip
				})),
				nextCursor:
					last && rows.length > query.limit ? cursorOf({ at: last.occurred_at, id: last.id }) : null
			};
		});
	}
}
