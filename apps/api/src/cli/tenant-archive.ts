import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Database, TenantContext } from '../db/database';

export async function archiveTenant(db: Database, tenantId: string) {
	const ctx: TenantContext = {
		tenantId,
		userId: null,
		role: 'admin',
		employeeId: null,
		requestId: randomUUID()
	};

	await db.withTenant(ctx, (trx) => sql`select ops.tenant_archive(${tenantId})`.execute(trx));
}
