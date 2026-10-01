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

	client(trx: Trx, clientId: string) {
		return trx
			.selectFrom('app.clients')
			.select(['name', 'number', 'invoice_locale as invoiceLocale'])
			.where('id', '=', clientId)
			.executeTakeFirst();
	}

	// live bookings, not the frozen assignment of an issued invoice (that one lives in invoices.store.ts)
	timeReportEntries(trx: Trx, clientId: string, from: string, to: string) {
		return trx
			.selectFrom('app.project_entries as e')
			.innerJoin('app.projects as p', 'p.id', 'e.project_id')
			.leftJoin('app.tasks as t', 't.id', 'e.task_id')
			.select([
				'e.workday',
				'e.started_at as startedAt',
				'e.ended_at as endedAt',
				'e.note',
				'e.billable as entryBillable',
				't.billable as taskBillable',
				'p.billable as projectBillable',
				'p.id as projectId',
				'p.name as projectName',
				'p.code as projectCode',
				't.id as taskId',
				't.name as taskName'
			])
			.where('p.client_id', '=', clientId)
			.where('e.workday', '>=', from)
			.where('e.workday', '<=', to)
			.where('e.ended_at', 'is not', null)
			.where('e.voided_at', 'is', null)
			.orderBy('e.started_at')
			.execute();
	}
}
