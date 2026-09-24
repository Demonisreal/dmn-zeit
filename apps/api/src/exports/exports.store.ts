import { Injectable } from '@nestjs/common';
import type { Locale, Timesheet } from '@zeit/shared';
import { sql } from 'kysely';
import type { Trx } from '../db/database';
import type { Staff } from '../months/months.store';
import type { SnapshotRow } from '../months/snapshot';

@Injectable()
export class ExportsStore {
	async identities(trx: Trx, ids: readonly string[]): Promise<Staff[]> {
		if (ids.length === 0) return [];
		return trx
			.selectFrom('app.employees as e')
			.select([
				'e.id',
				sql<string>`e.first_name || ' ' || e.last_name`.as('name'),
				'e.personnel_no as personnelNo'
			])
			.where('e.id', 'in', ids)
			.orderBy('e.last_name')
			.orderBy('e.first_name')
			.execute();
	}

	tenant(trx: Trx): Promise<Timesheet['tenant']> {
		return trx.selectFrom('app.tenants').select(['name', 'state']).executeTakeFirstOrThrow();
	}

	async locale(trx: Trx, userId: string): Promise<Locale> {
		const user = await trx
			.selectFrom('app.users')
			.select('locale')
			.where('id', '=', userId)
			.executeTakeFirstOrThrow();
		return user.locale as Locale;
	}

	// only hr reads month_closings, everyone else gets the own row through the definer function
	async monthSnapshot(trx: Trx, employeeId: string, month: string): Promise<SnapshotRow | null> {
		const { rows } = await sql<{ row: SnapshotRow | null }>`
			select app.month_snapshot(${employeeId}, ${`${month}-01`}) as row`.execute(trx);
		return rows[0]?.row ?? null;
	}
}
