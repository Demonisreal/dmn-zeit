import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { sql } from 'kysely';
import { Database } from '../db/database';
import { withAdvisoryLock } from './advisory-lock';

@Injectable()
export class CleanupJob {
	constructor(private readonly db: Database) {}

	@Cron(CronExpression.EVERY_HOUR, { name: 'cleanup', timeZone: 'Europe/Berlin' })
	async purgeExpired() {
		await withAdvisoryLock(this.db, 'zeit:cleanup', async (conn) => {
			await sql`select auth.purge_expired()`.execute(conn);
		});
	}
}
