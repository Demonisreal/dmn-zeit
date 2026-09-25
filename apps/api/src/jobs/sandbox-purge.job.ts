import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { sql } from 'kysely';
import { Database } from '../db/database';
import { withAdvisoryLock } from './advisory-lock';

// ops.purge_expired_sandboxes stops after this many to stay inside the statement timeout
const BATCH = 10;

@Injectable()
export class SandboxPurgeJob {
	constructor(private readonly db: Database) {}

	@Cron('*/15 * * * *', { name: 'sandbox-purge', timeZone: 'Europe/Berlin' })
	async purgeExpired() {
		await withAdvisoryLock(this.db, 'zeit:sandbox-purge', async (conn) => {
			let purged: number;
			do {
				const { rows } = await sql<{ purged: number }>`
					select ops.purge_expired_sandboxes() as purged`.execute(conn);
				purged = rows[0]!.purged;
			} while (purged === BATCH);

			// a new day salts the address hashes anew, yesterday's counters would never be hit again
			await sql`delete from ops.rate_limits
				where key like 'demo-sandbox:%' and expires_at <= now()`.execute(conn);
		});
	}
}
