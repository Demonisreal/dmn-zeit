import { Injectable } from '@nestjs/common';
import type { Role } from '@zeit/shared';
import { sql } from 'kysely';
import { Database } from '../db/database';
import type { Client } from './client.decorator';

export type AuditEntry = {
	tenantId: string;
	// the person the entry is about
	userId: string;
	employeeId?: string | null;
	// null when nobody is signed in yet, a failed login for instance
	actor: { userId: string; role: Role } | null;
	action: string;
	details?: Record<string, string>;
	client: Client;
};

@Injectable()
export class Audit {
	constructor(private readonly db: Database) {}

	record(entry: AuditEntry): Promise<void> {
		return this.db.transaction().execute(async (trx) => {
			// the insert policy wants actor and role exactly as the context names them
			await sql`select set_config('app.tenant_id', ${entry.tenantId}, true),
				set_config('app.user_id', ${entry.actor?.userId ?? ''}, true),
				set_config('app.role', ${entry.actor?.role ?? ''}, true)`.execute(trx);
			await trx
				.insertInto('audit.log')
				.values({
					tenant_id: entry.tenantId,
					actor_user_id: entry.actor?.userId ?? null,
					actor_role: entry.actor?.role ?? null,
					source: 'app',
					action: entry.action,
					table_name: 'users',
					row_id: entry.userId,
					subject_employee_id: entry.employeeId ?? null,
					diff: entry.details ?? null,
					request_id: entry.client.requestId,
					ip: entry.client.ip
				})
				.execute();
		});
	}
}
