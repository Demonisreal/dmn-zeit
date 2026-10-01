import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/schema.generated';

export function withAdvisoryLock(
	db: Kysely<DB>,
	name: string,
	work: (conn: Kysely<DB>) => Promise<void>
): Promise<boolean> {
	return db.connection().execute(async (conn) => {
		const { rows } = await sql<{ locked: boolean }>`
			select pg_try_advisory_lock(hashtext(${name})) as locked`.execute(conn);
		if (!rows[0]?.locked) return false;

		try {
			await work(conn);
		} finally {
			await sql`select pg_advisory_unlock(hashtext(${name}))`.execute(conn);
		}
		return true;
	});
}
