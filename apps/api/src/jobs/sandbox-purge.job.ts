import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { sql } from 'kysely';
import { Database } from '../db/database';
import { withAdvisoryLock } from './advisory-lock';

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
			for (const { id } of due) {
				try {
					await sql`select ops.purge_sandbox(${id}::uuid)`.execute(conn);
				} catch (error) {
					this.logger.error(error, `Purge failed for sandbox ${id}`);
				}
			}

			await sql`delete from ops.rate_limits
				where key like 'demo-sandbox:%' and expires_at <= now()`.execute(conn);
		});
	}
}
