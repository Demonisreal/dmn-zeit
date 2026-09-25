import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Clock as ClockState, EndReason } from '@zeit/shared';
import { Clock } from '../common/clock';
import type { AuthSession } from '../common/session.guard';
import { Database, type Trx } from '../db/database';
import { clockState, localDate } from './day-engine';
import { TimeStore } from './time.store';

@Injectable()
export class ClockService {
	constructor(
		private readonly db: Database,
		private readonly store: TimeStore,
		private readonly clock: Clock
	) {}

	state(session: AuthSession): Promise<ClockState> {
		const employeeId = employeeOf(session);
		return this.db.withTenant(session, (trx) => this.current(trx, employeeId));
	}

	clockIn(session: AuthSession): Promise<ClockState> {
		const employeeId = employeeOf(session);
		return this.db.withTenant(session, async (trx) => {
			if ((await this.current(trx, employeeId)).state === 'working') {
				throw new ConflictException('Already clocked in');
			}
			await this.store.stamp(trx, session, employeeId);
			return this.current(trx, employeeId);
		});
	}

	resume(session: AuthSession): Promise<ClockState> {
		const employeeId = employeeOf(session);
		return this.db.withTenant(session, async (trx) => {
			if ((await this.current(trx, employeeId)).state !== 'on_break') {
				throw new ConflictException('Not on a break');
			}
			await this.store.stamp(trx, session, employeeId);
			return this.current(trx, employeeId);
		});
	}

	end(session: AuthSession, reason: EndReason): Promise<ClockState> {
		const employeeId = employeeOf(session);
		return this.db.withTenant(session, async (trx) => {
			if (!(await this.store.endRunning(trx, employeeId, reason))) {
				throw new ConflictException('Not clocked in');
			}
			return this.current(trx, employeeId);
		});
	}

	private async current(trx: Trx, employeeId: string): Promise<ClockState> {
		const now = this.clock.now();
		const today = localDate(now);
		return clockState(await this.store.clockEntries(trx, employeeId, today), today, now);
	}
}

// admins without a personnel record have nothing to stamp
export function employeeOf(session: AuthSession): string {
	if (!session.employeeId) throw new ForbiddenException('No personnel record for this account');
	return session.employeeId;
}
