import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { sql } from 'kysely';
import { Database } from '../db/database';
import { withAdvisoryLock } from './advisory-lock';

// MAX_SANDBOXES live 24 hours each, a hundred every quarter hour keeps up easily
const PER_RUN = 100;

@Injectable()
export class SandboxPurgeJob {
	private readonly logger = new Logger(SandboxPurgeJob.name);

	constructor(private readonly db: Database) {}

	@Cron('*/15 * * * *', { name: 'sandbox-purge', timeZone: 'Europe/Berlin' })
	async purgeExpired() {
		await withAdvisoryLock(this.db, 'zeit:sandbox-purge', async (conn) => {
			const { rows: due } = await sql<{ id: string }>`
				select id from ops.expired_sandboxes(${PER_RUN})`.execute(conn);
			// one statement each, so a sandbox that fails is skipped instead of holding up the rest
			for (const { id } of due) {
				try {
					await sql`select ops.purge_sandbox(${id}::uuid)`.execute(conn);
				} catch (error) {
					this.logger.error(error, `Purge failed for sandbox ${id}`);
				}
			}

			// a new day salts the address hashes anew, yesterday's counters would never be hit again
			await sql`delete from ops.rate_limits
				where key like 'demo-sandbox:%' and expires_at <= now()`.execute(conn);
		});
	}
}
