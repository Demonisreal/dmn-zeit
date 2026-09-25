import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { annualEntitlement, compare, fraction, toDecimal } from '@zeit/rules';
import { Temporal } from 'temporal-polyfill';
import { Clock } from '../common/clock';
import { Database } from '../db/database';
import { berlinToday } from '../vacation/buckets';
import { VacationStore, type NewLedgerEntry } from '../vacation/vacation.store';
import { withAdvisoryLock } from './advisory-lock';
import { activeTenants, jobContext } from './tenants';

@Injectable()
export class VacationYearOpeningJob {
	private readonly logger = new Logger(VacationYearOpeningJob.name);

	constructor(
		private readonly db: Database,
		private readonly vacation: VacationStore,
		private readonly clock: Clock
	) {}

	@Cron('5 0 1 1 *', { name: 'vacation-year-opening', timeZone: 'Europe/Berlin' })
	async openYear() {
		const year = berlinToday(this.clock.now()).year;
		await withAdvisoryLock(this.db, 'zeit:vacation-year-opening', async (conn) => {
			for (const { id: tenantId, workspace } of await activeTenants(conn)) {
				if (workspace === 'solo') continue;
				// one broken tenant must not keep the others from their new leave year
				try {
					await this.open(tenantId, year);
				} catch (error) {
					this.logger.error(error, `Leave year ${year} not opened for tenant ${tenantId}`);
				}
			}
		});
	}

	// the dedupe key makes a second run after a crash book nothing new
	open(tenantId: string, year: number): Promise<number> {
		const newYear = Temporal.PlainDate.from({ year, month: 1, day: 1 });
		return this.db.withTenant(jobContext(tenantId), async (trx) => {
			const employees = await trx
				.selectFrom('app.employees')
				.select('id')
				.where('entry_date', '<=', `${year}-12-31`)
				.where((eb) =>
					eb.or([eb('exit_date', 'is', null), eb('exit_date', '>=', newYear.toString())])
				)
				.execute();

			const entries: NewLedgerEntry[] = [];
			for (const { id } of employees) {
				const employment = await this.vacation.employment(trx, id);
				const { rounded } = annualEntitlement(employment!, year, newYear);
				if (compare(rounded, fraction(0)) <= 0) continue;
				entries.push({
					employeeId: id,
					bucketYear: year,
					entryType: 'entitlement',
					days: toDecimal(rounded, 2),
					effectiveDate: newYear.toString(),
					dedupeKey: `vacation-entitlement:${id}:${year}`,
					createdBy: null
				});
			}
			return (await this.vacation.book(trx, entries)).length;
		});
	}
}
