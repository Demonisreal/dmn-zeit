import { Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { Role } from '@zeit/shared';
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import { Pool, TypeOverrides, types } from 'pg';
import type { DB } from './schema.generated';

export type Trx = Transaction<DB>;

export type TenantContext = {
	tenantId: string;
	userId: string | null;
	role: Role;
	employeeId: string | null;
	requestId: string;
};

export function isoInstant(text: string): string {
	return text.replace(' ', 'T').replace(/\+00$/, 'Z');
}

const parsers = new TypeOverrides();
parsers.setTypeParser(types.builtins.TIMESTAMPTZ, isoInstant);
parsers.setTypeParser(types.builtins.DATE, (text) => text);

export const POOL = { max: 10, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000 };

export class Database extends Kysely<DB> implements OnApplicationShutdown {
	constructor(url: string, demo = false) {
		const pool = new Pool({
			...POOL,
			connectionString: url,
			types: parsers,
			options: `-c TimeZone=UTC -c app.demo_mode=${demo}`
		});
		pool.on('error', (error) => new Logger(Database.name).warn(`Idle client: ${error.message}`));
		super({ dialect: new PostgresDialect({ pool }) });
	}

	withTenant<T>(ctx: TenantContext, work: (trx: Trx) => Promise<T>): Promise<T> {
		return this.transaction().execute(async (trx) => {
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
