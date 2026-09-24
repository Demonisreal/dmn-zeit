import { Injectable } from '@nestjs/common';
import type { EmployeeRef, MonthClosingAction, MonthOverview } from '@zeit/shared';
import { sql } from 'kysely';
import type { Trx } from '../db/database';
import { TIME_ZONE } from '../time/day-engine';
import type { DateRange } from '../time/time.store';
import type { MonthSnapshot } from './snapshot';

export type Staff = MonthOverview['rows'][number]['employee'];

export type Leave = { vacationDays: string; sickDays: string };

export type Cap = { employeeId: string; minutes: number };

export type NewClosing = {
	id: string;
	month: string;
	action: MonthClosingAction;
	reason: string | null;
	snapshot: MonthSnapshot | null;
};

const name = sql<string>`e.first_name || ' ' || e.last_name`.as('name');

@Injectable()
export class MonthsStore {
	// closed means one close more than reopens, the same count the closing trigger makes
	async lastClosed(trx: Trx): Promise<string | null> {
		const closed = trx
			.selectFrom('app.month_closings')
			.select('month')
			.groupBy('month')
			.having(
				sql<boolean>`count(*) filter (where action = 'close') > count(*) filter (where action = 'reopen')`
			);
		const row = await trx
			.selectFrom(closed.as('c'))
			.select((eb) => eb.fn.max<string | null>('c.month').as('month'))
			.executeTakeFirstOrThrow();
		return row.month === null ? null : row.month.slice(0, 7);
	}

	employed(trx: Trx, range: DateRange): Promise<Staff[]> {
		return trx
			.selectFrom('app.employees as e')
			.select(['e.id', name, 'e.personnel_no as personnelNo'])
			.where('e.entry_date', '<=', range.to)
			.where((eb) => eb.or([eb('e.exit_date', 'is', null), eb('e.exit_date', '>=', range.from)]))
			.orderBy('e.last_name')
			.orderBy('e.first_name')
			.execute();
	}

	// a running entry reaches into every month after its start, the close would lock it for good
	running(trx: Trx, through: string): Promise<EmployeeRef[]> {
		return trx
			.selectFrom('app.time_entries as t')
			.innerJoin('app.employees as e', 'e.id', 't.employee_id')
			.select(['e.id', name])
			.where('t.ended_at', 'is', null)
			.where('t.voided_at', 'is', null)
			.where('t.workday', '<=', through)
			.orderBy('e.last_name')
			.orderBy('e.first_name')
			.execute();
	}

	// approving touches the old entry and writes the new times, either one may lie in the month
	pendingCorrections(trx: Trx, range: DateRange): Promise<EmployeeRef[]> {
		return trx
			.selectFrom('app.correction_requests as c')
			.innerJoin('app.employees as e', 'e.id', 'c.employee_id')
			.leftJoin('app.time_entries as t', 't.id', 'c.target_entry_id')
			.select(['e.id', name])
			.where('c.status', '=', 'pending')
			.where((eb) =>
				eb.or([
					eb.between('t.workday', range.from, range.to),
					eb.between(
						sql<string>`(c.new_started_at at time zone ${TIME_ZONE})::date`,
						range.from,
						range.to
					)
				])
			)
			.orderBy('e.last_name')
			.orderBy('e.first_name')
			.execute();
	}

	pendingAbsences(trx: Trx, range: DateRange): Promise<EmployeeRef[]> {
		return trx
			.selectFrom('app.absence_requests as r')
			.innerJoin('app.employees as e', 'e.id', 'r.employee_id')
			.select(['e.id', name])
			.where('r.status', 'in', ['pending', 'cancel_pending'])
			.where('r.start_date', '<=', range.to)
			.where('r.end_date', '>=', range.from)
			.orderBy('e.last_name')
			.orderBy('e.first_name')
			.execute();
	}

	// a cancellation still waiting for its decision counts as taken, like on the day itself
	async leave(
		trx: Trx,
		employeeIds: readonly string[],
		range: DateRange
	): Promise<Map<string, Leave>> {
		if (employeeIds.length === 0) return new Map();
		const rows = await trx
			.selectFrom('app.absence_days as d')
			.innerJoin('app.absence_requests as r', 'r.id', 'd.absence_id')
			.select([
				'd.employee_id',
				sql<string>`coalesce(sum(d.vacation_days) filter (where r.type = 'vacation'), 0)::numeric(5, 2)`.as(
					'vacation_days'
				),
				sql<string>`coalesce(sum(d.portion) filter (where r.type = 'sick'), 0)::numeric(5, 2)`.as(
					'sick_days'
				)
			])
			.where('d.employee_id', 'in', employeeIds)
			.where('d.superseded_at', 'is', null)
			.where('d.date', '>=', range.from)
			.where('d.date', '<=', range.to)
			.where('r.status', 'in', ['approved', 'cancel_pending'])
			.groupBy('d.employee_id')
			.execute();
		return new Map(
			rows.map((row) => [
				row.employee_id,
				{ vacationDays: row.vacation_days, sickDays: row.sick_days }
			])
		);
	}

	// after a reopen the month can be closed again, the latest close is the one in force
	async latestClose(
		trx: Trx,
		month: string
	): Promise<{ id: string; snapshot: MonthSnapshot | null } | undefined> {
		const row = await trx
			.selectFrom('app.month_closings')
			.select(['id', 'snapshot'])
			.where('month', '=', `${month}-01`)
			.where('action', '=', 'close')
			.orderBy('created_at', 'desc')
			.limit(1)
			.executeTakeFirst();
		return row && { id: row.id, snapshot: row.snapshot as MonthSnapshot | null };
	}

	caps(trx: Trx, closingId: string): Promise<Cap[]> {
		return trx
			.selectFrom('app.flex_bookings')
			.select(['employee_id as employeeId', 'minutes'])
			.where('month_closing_id', '=', closingId)
			.execute();
	}

	async bookCaps(
		trx: Trx,
		userId: string,
		closingId: string,
		date: string,
		reason: string,
		caps: readonly Cap[]
	): Promise<void> {
		if (caps.length === 0) return;
		await trx
			.insertInto('app.flex_bookings')
			.values(
				caps.map((cap) => ({
					tenant_id: sql<string>`app.tenant_id()`,
					employee_id: cap.employeeId,
					type: 'cap_forfeit' as const,
					minutes: cap.minutes,
					effective_date: date,
					reason,
					month_closing_id: closingId,
					created_by: userId
				}))
			)
			.execute();
	}

	insertClosing(trx: Trx, userId: string, closing: NewClosing): Promise<{ createdAt: string }> {
		return trx
			.insertInto('app.month_closings')
			.values({
				id: closing.id,
				tenant_id: sql<string>`app.tenant_id()`,
				month: `${closing.month}-01`,
				action: closing.action,
				reason: closing.reason,
				snapshot: closing.snapshot,
				created_by: userId
			})
			.returning('created_at as createdAt')
			.executeTakeFirstOrThrow();
	}
}
