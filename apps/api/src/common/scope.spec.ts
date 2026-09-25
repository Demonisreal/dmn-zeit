import { ForbiddenException } from '@nestjs/common';
import {
	DummyDriver,
	Kysely,
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
	type CompiledQuery,
	type DatabaseConnection
} from 'kysely';
import { describe, expect, it } from 'vitest';
import type { Trx } from '../db/database';
import type { DB } from '../db/schema.generated';
import { assertCanSee } from './scope';
import type { AuthSession } from './session.guard';

// answers every query with { leads } and remembers what was asked
function trxWhere(leads: boolean) {
	const asked: CompiledQuery[] = [];
	class Answering extends DummyDriver {
		async acquireConnection(): Promise<DatabaseConnection> {
			return {
				executeQuery: async <R>(query: CompiledQuery) => {
					asked.push(query);
					return { rows: [{ leads } as R] };
				},
				streamQuery: async function* () {}
			};
		}
	}
	const db = new Kysely<DB>({
		dialect: {
			createAdapter: () => new PostgresAdapter(),
			createDriver: () => new Answering(),
			createIntrospector: (kysely) => new PostgresIntrospector(kysely),
			createQueryCompiler: () => new PostgresQueryCompiler()
		}
	});
	return { trx: db as unknown as Trx, asked };
}

function session(role: AuthSession['role'], employeeId: string | null): AuthSession {
	return {
		id: 's1',
		userId: 'u1',
		tenantId: 't1',
		role,
		workspace: 'company',
		employeeId,
		csrfHash: Buffer.alloc(32),
		enrollmentPending: false,
		reauthUntil: null,
		requestId: 'r1'
	};
}

describe('assertCanSee', () => {
	it('lets everyone see themselves without asking the database', async () => {
		const { trx, asked } = trxWhere(false);
		await expect(assertCanSee(trx, session('employee', 'e1'), 'e1')).resolves.toBeUndefined();
		expect(asked).toHaveLength(0);
	});

	it('lets hr and admins see the whole tenant, RLS keeps other tenants out', async () => {
		const { trx, asked } = trxWhere(false);
		await expect(assertCanSee(trx, session('hr', null), 'e2')).resolves.toBeUndefined();
		await expect(assertCanSee(trx, session('admin', 'e1'), 'e2')).resolves.toBeUndefined();
		expect(asked).toHaveLength(0);
	});

	it('asks app.leads for a team lead', async () => {
		const leading = trxWhere(true);
		await expect(
			assertCanSee(leading.trx, session('team_lead', 'e1'), 'e2')
		).resolves.toBeUndefined();
		expect(leading.asked[0]?.sql).toMatch(/app\.leads\(\$1\)/);
		expect(leading.asked[0]?.parameters).toEqual(['e2']);

		const other = trxWhere(false);
		await expect(assertCanSee(other.trx, session('team_lead', 'e1'), 'e3')).rejects.toThrow(
			ForbiddenException
		);
	});

	it('keeps employees to their own data', async () => {
		const { trx, asked } = trxWhere(true);
		await expect(assertCanSee(trx, session('employee', 'e1'), 'e2')).rejects.toThrow(
			ForbiddenException
		);
		expect(asked).toHaveLength(0);
	});
});
