import { randomUUID } from 'node:crypto';
import type { FederalState } from '@zeit/shared';
import { sql } from 'kysely';
import { hashToken, newToken } from '../auth/tokens';
import type { Database, TenantContext } from '../db/database';

export type NewTenant = {
	name: string;
	slug: string;
	state: FederalState;
	adminEmail: string;
	adminName: string;
};

// db connects as zeit_owner, only ops.tenant_create may insert; the context just fills the trail
export async function createTenant(db: Database, tenant: NewTenant, origin: string) {
	const tenantId = randomUUID();
	const token = newToken();
	const ctx: TenantContext = {
		tenantId,
		userId: null,
		role: 'admin',
		employeeId: null,
		requestId: randomUUID()
	};

	await db.withTenant(ctx, (trx) =>
		sql`select ops.tenant_create(${tenantId}, ${tenant.name}, ${tenant.slug}, ${tenant.state},
			${tenant.adminEmail}, ${tenant.adminName}, ${hashToken(token)})`.execute(trx)
	);

	return `${origin}/invite#t=${token}`;
}
