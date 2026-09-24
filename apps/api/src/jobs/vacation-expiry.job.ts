import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { compare, fraction, negate, toDecimal } from '@zeit/rules';
import type { Temporal } from 'temporal-polyfill';
import { Clock } from '../common/clock';
import { Database } from '../db/database';
import { berlinToday, bucketsOf } from '../vacation/buckets';
import { VacationStore, type NewLedgerEntry } from '../vacation/vacation.store';
import { withAdvisoryLock } from './advisory-lock';
import { activeTenants, jobContext } from './tenants';

@Injectable()
export class VacationExpiryJob {
	private readonly logger = new Logger(VacationExpiryJob.name);

	constructor(
		private readonly db: Database,
		private readonly vacation: VacationStore,
		private readonly clock: Clock
	) {}

	@Cron('0 2 * * *', { name: 'vacation-expiry', timeZone: 'Europe/Berlin' })
	async expireAll() {
		const today = berlinToday(this.clock.now());
		await withAdvisoryLock(this.db, 'zeit:vacation-expiry', async (conn) => {
			for (const tenantId of await activeTenants(conn)) {
				try {
					await this.expire(tenantId, today);
				} catch (error) {
					this.logger.error(error, `Leave expiry failed for tenant ${tenantId}`);
				}
			}
		});
	}

	// without a notice nothing expires (BAG 2019), so only people who got one are looked at
	expire(tenantId: string, today: Temporal.PlainDate): Promise<number> {
		return this.db.withTenant(jobContext(tenantId), async (trx) => {
			const { carryoverUntil } = await this.vacation.calendar(trx);
			const told = await trx
				.selectFrom('app.vacation_notices')
				.select('employee_id')
				.distinct()
				.execute();

			const entries: NewLedgerEntry[] = [];
			for (const { employee_id: employeeId } of told) {
				const buckets = bucketsOf(
					await this.vacation.ledger(trx, employeeId),
					await this.vacation.notices(trx, employeeId),
					carryoverUntil,
					today
				);
				for (const bucket of buckets) {
					if (bucket.expiry.kind !== 'forfeit' || compare(bucket.remaining, fraction(0)) <= 0) {
						continue;
					}
					entries.push({
						employeeId,
						bucketYear: bucket.year,
						entryType: 'expiry',
						days: toDecimal(negate(bucket.remaining), 2),
						// the deadline the notice named, not the night the job got to it
						effectiveDate: bucket.payable.deadline!.toString(),
						noticeId: bucket.notice!.id,
						dedupeKey: `vacation-expiry:${employeeId}:${bucket.year}`,
						createdBy: null
					});
				}
			}
			return (await this.vacation.book(trx, entries)).length;
		});
	}
}
