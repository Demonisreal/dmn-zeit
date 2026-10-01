import { randomUUID } from 'node:crypto';
import type { WorkspaceKind } from '@zeit/shared';
import { sql, type Kysely } from 'kysely';
import type { TenantContext } from '../db/database';
import type { DB } from '../db/schema.generated';

type ActiveTenant = { id: string; workspace: WorkspaceKind };

export async function activeTenants(db: Kysely<DB>): Promise<ActiveTenant[]> {
	const { rows } = await sql<ActiveTenant>`
		select id, workspace from ops.active_tenants()`.execute(db);
	return rows;
}

export function jobContext(tenantId: string): TenantContext {
	return { tenantId, userId: null, role: 'hr', employeeId: null, requestId: randomUUID() };
}
