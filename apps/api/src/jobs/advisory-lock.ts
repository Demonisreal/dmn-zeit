import { sql, type Kysely } from 'kysely';
import type { Tables } from '../db/database';

// session lock on one pooled connection; while a deploy overlaps two containers only one runs the job
export function withAdvisoryLock(
	db: Kysely<Tables>,
	name: string,
	work: (conn: Kysely<Tables>) => Promise<void>
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
