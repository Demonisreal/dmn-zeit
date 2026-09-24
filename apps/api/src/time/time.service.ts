import { Injectable, NotFoundException } from '@nestjs/common';
import type { DayRange, DaysQuery, EntriesQuery, FlexAccount, TimeEntryPage } from '@zeit/shared';
import { Clock } from '../common/clock';
import { assertCanSee } from '../common/scope';
import type { AuthSession } from '../common/session.guard';
import { Database } from '../db/database';
import { decodeCursor, encodeCursor } from './cursor';
import { buildDays, localDate, summarizeFlex, totalsOf } from './day-engine';
import { TimeStore } from './time.store';

@Injectable()
export class TimeService {
	constructor(
		private readonly db: Database,
		private readonly store: TimeStore,
		private readonly clock: Clock
	) {}

	entries(session: AuthSession, employeeId: string, query: EntriesQuery): Promise<TimeEntryPage> {
		const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
		return this.db.withTenant(session, async (trx) => {
			await assertCanSee(trx, session, employeeId);
			const rows = await this.store.entries(trx, employeeId, query, after, query.limit + 1);
			const items = rows.slice(0, query.limit);
			const last = items.at(-1);
			return {
				items,
				nextCursor: rows.length > query.limit && last ? encodeCursor(last.startedAt, last.id) : null
			};
		});
	}

	days(session: AuthSession, employeeId: string, range: DaysQuery): Promise<DayRange> {
		return this.db.withTenant(session, async (trx) => {
			await assertCanSee(trx, session, employeeId);
			const { tenant, sheets } = await this.store.sheets(trx, [employeeId], range);
			const sheet = sheets.get(employeeId);
			if (!sheet) throw new NotFoundException('Employee not found');

			const days = buildDays(sheet, tenant, range, this.clock.now());
			return {
				employeeId,
				from: range.from,
				to: range.to,
				closedThrough: sheet.employee.closedThrough,
				days,
				totals: totalsOf(days)
			};
		});
	}

	// a past year counts through 31.12., the running one through today, a future one has nothing yet
	flex(session: AuthSession, employeeId: string, year: number): Promise<FlexAccount> {
		const now = this.clock.now();
		const today = localDate(now);
		const calendarYear = { from: `${year}-01-01`, to: `${year}-12-31` };
		const asOf = today < calendarYear.to ? today : calendarYear.to;

		return this.db.withTenant(session, async (trx) => {
			await assertCanSee(trx, session, employeeId);
			const counted = { from: calendarYear.from, to: asOf };
			const { tenant, sheets } = await this.store.sheets(trx, [employeeId], counted);
			const sheet = sheets.get(employeeId);
			if (!sheet) throw new NotFoundException('Employee not found');
			const bookings = await this.store.flexBookings(trx, [employeeId], calendarYear);

			const days = buildDays(sheet, tenant, counted, now);
			const flex = summarizeFlex(
				days,
				bookings.filter((booking) => booking.effectiveDate <= asOf),
				sheet.employee.closedThrough
			);
			const contract = sheet.contracts.findLast((c) => c.validFrom <= asOf);
			return {
				employeeId,
				year,
				...flex,
				asOf,
				cap: { ...(contract?.flexCap ?? tenant.flexCap), mode: tenant.flexCapMode },
				bookings
			};
		});
	}
}
