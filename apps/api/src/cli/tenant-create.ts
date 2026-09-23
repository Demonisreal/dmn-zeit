import { randomUUID } from 'node:crypto';
import type { FederalState } from '@zeit/shared';
import { sql } from 'kysely';
import { hashToken, INVITE_TTL, newToken } from '../auth/tokens';
import type { Database, TenantContext } from '../db/database';

export type NewTenant = {
	name: string;
	slug: string;
	state: FederalState;
	adminEmail: string;
	adminName: string;
};

// zeit_app with an admin context of the tenant about to exist, exactly what the insert policies allow
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

	await db.withTenant(ctx, async (trx) => {
		await trx
			.insertInto('app.tenants')
			.values({ id: tenantId, name: tenant.name, slug: tenant.slug, state: tenant.state })
			.execute();
		const admin = await trx
			.insertInto('app.users')
			.values({
				tenant_id: tenantId,
				email: tenant.adminEmail,
				display_name: tenant.adminName,
				role: 'admin'
			})
			.returning('id')
			.executeTakeFirstOrThrow();
		await sql`select auth.token_issue(${admin.id}, 'invite', ${hashToken(token)},
			${INVITE_TTL}::interval)`.execute(trx);
	});

	return `${origin}/invite#t=${token}`;
}
