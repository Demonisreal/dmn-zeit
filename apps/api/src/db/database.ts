import { Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { Role } from '@zeit/shared';
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import { Pool, TypeOverrides, types } from 'pg';
import type { DB } from './schema.generated';

export type Trx = Transaction<DB>;

export type TenantContext = {
	tenantId: string;
	// null only for the cli, the trail then shows no person as actor
	userId: string | null;
	role: Role;
	employeeId: string | null;
	requestId: string;
};

// under TimeZone=UTC pg prints "2026-09-24 08:15:00.123456+00", the api speaks ISO 8601
export function isoInstant(text: string): string {
	return text.replace(' ', 'T').replace(/\+00$/, 'Z');
}

const parsers = new TypeOverrides();
// a js Date would drop the microseconds, numeric already arrives as text; codegen types match this
parsers.setTypeParser(types.builtins.TIMESTAMPTZ, isoInstant);
parsers.setTypeParser(types.builtins.DATE, (text) => text);

export class Database extends Kysely<DB> implements OnApplicationShutdown {
	constructor(url: string) {
		const pool = new Pool({ connectionString: url, types: parsers, options: '-c TimeZone=UTC' });
		// an idle client losing its connection would otherwise take the whole process down
		pool.on('error', (error) => new Logger(Database.name).warn(`Idle client: ${error.message}`));
		super({ dialect: new PostgresDialect({ pool }) });
	}

	withTenant<T>(ctx: TenantContext, work: (trx: Trx) => Promise<T>): Promise<T> {
		return this.transaction().execute(async (trx) => {
			// is_local, so nothing of it outlives the transaction in the pooled connection
			await sql`select set_config('app.tenant_id', ${ctx.tenantId}, true),
				set_config('app.user_id', ${ctx.userId ?? ''}, true),
				set_config('app.role', ${ctx.role}, true),
				set_config('app.employee_id', ${ctx.employeeId ?? ''}, true),
				set_config('app.request_id', ${ctx.requestId}, true)`.execute(trx);
			return work(trx);
		});
	}

	onApplicationShutdown() {
		return this.destroy();
	}
}
