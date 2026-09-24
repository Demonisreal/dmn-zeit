import { Injectable } from '@nestjs/common';
import type { Absence, AbsenceStatus, AbsenceType } from '@zeit/shared';
import { sql, type Expression, type ExpressionBuilder, type SqlBool } from 'kysely';
import type { Trx } from '../db/database';
import type { AppAbsenceRequests, AppEmployees, DB } from '../db/schema.generated';
import { VacationStore } from '../vacation/vacation.store';

export type NewAbsence = {
	employeeId: string;
	type: AbsenceType;
	startDate: string;
	endDate: string;
	halfDayStart: boolean;
	halfDayEnd: boolean;
	note: string | null;
	requestedBy: string;
};

export type NewDay = {
	employeeId: string;
	absenceId: string;
	date: string;
	portion: 0.5 | 1;
	targetMinutes: number;
	vacationDays: string;
};

export type ActiveDay = {
	id: string;
	absenceId: string;
	date: string;
	vacationDays: string;
};

export type Decision = {
	userId: string;
	note: string | null;
};

export type Filter = (
	eb: ExpressionBuilder<DB & { r: AppAbsenceRequests; e: AppEmployees }, 'r' | 'e'>
) => Expression<SqlBool>;

function absenceQuery(trx: Trx) {
	return trx
		.selectFrom('app.absence_requests as r')
		.innerJoin('app.employees as e', 'e.id', 'r.employee_id')
		.select((eb) => [
			'r.id',
			'r.employee_id',
			sql<string>`e.first_name || ' ' || e.last_name`.as('employee_name'),
			'r.type',
			'r.start_date',
			'r.end_date',
			'r.half_day_start',
			'r.half_day_end',
			'r.status',
			'r.note',
			'r.requested_by',
			'r.decided_by',
			'r.decided_at',
			'r.decision_note',
			'r.certificate_confirmed_at',
			'r.certificate_confirmed_by',
			'r.created_at',
			// days a sick note took over no longer belong to this request, cancelled ones still do
			eb
				.selectFrom('app.absence_days as d')
				.select(sql<string>`coalesce(sum(d.vacation_days), 0)::numeric(5, 2)`.as('days'))
				.whereRef('d.absence_id', '=', 'r.id')
				.where('d.superseded_by', 'is', null)
				.as('vacation_days'),
			eb
				.selectFrom('app.absence_days as d')
				.select(sql<number>`coalesce(sum(d.target_minutes), 0)::int`.as('minutes'))
				.whereRef('d.absence_id', '=', 'r.id')
				.where('d.superseded_by', 'is', null)
				.as('target_minutes')
		]);
}

@Injectable()
export class AbsencesStore {
	constructor(private readonly vacation: VacationStore) {}

	async insert(trx: Trx, absence: NewAbsence): Promise<string> {
		const row = await trx
			.insertInto('app.absence_requests')
			.values({
				tenant_id: sql<string>`app.tenant_id()`,
				employee_id: absence.employeeId,
				type: absence.type,
				start_date: absence.startDate,
				end_date: absence.endDate,
				half_day_start: absence.halfDayStart,
				half_day_end: absence.halfDayEnd,
				// a sick note is taken note of, nobody approves it
				status: absence.type === 'sick' ? 'approved' : 'pending',
				note: absence.note,
				requested_by: absence.requestedBy
			})
			.returning('id')
			.executeTakeFirstOrThrow();
		return row.id;
	}

	async insertDays(trx: Trx, days: NewDay[]): Promise<void> {
		if (days.length === 0) return;
		await trx
			.insertInto('app.absence_days')
			.values(
				days.map((day) => ({
					tenant_id: sql<string>`app.tenant_id()`,
					employee_id: day.employeeId,
					absence_id: day.absenceId,
					date: day.date,
					portion: day.portion,
					target_minutes: day.targetMinutes,
					vacation_days: day.vacationDays
				}))
			)
			.execute();
	}

	// requests of the same person that are still in force, the no_overlap exclusion looks at the same
	async overlapping(trx: Trx, employeeId: string, from: string, to: string): Promise<string[]> {
		const rows = await trx
			.selectFrom('app.absence_requests')
			.select('id')
			.where('employee_id', '=', employeeId)
			.where('status', 'in', ['pending', 'approved', 'cancel_pending'])
			.where('start_date', '<=', to)
			.where('end_date', '>=', from)
			.orderBy('start_date')
			.execute();
		return rows.map((row) => row.id);
	}

	activeDays(trx: Trx, absenceId: string): Promise<ActiveDay[]> {
		return trx
			.selectFrom('app.absence_days')
			.select(['id', 'absence_id as absenceId', 'date', 'vacation_days as vacationDays'])
			.where('absence_id', '=', absenceId)
			.where('superseded_at', 'is', null)
			.orderBy('date')
			.execute();
	}

	async takenDates(trx: Trx, employeeId: string, from: string, to: string): Promise<Set<string>> {
		const rows = await trx
			.selectFrom('app.absence_days')
			.select('date')
			.where('employee_id', '=', employeeId)
			.where('superseded_at', 'is', null)
			.where('date', '>=', from)
			.where('date', '<=', to)
			.execute();
		return new Set(rows.map((row) => row.date));
	}

	// vacation already approved inside a sick note, what § 9 BUrlG may give back
	vacationWithin(trx: Trx, employeeId: string, from: string, to: string): Promise<ActiveDay[]> {
		return trx
			.selectFrom('app.absence_days as d')
			.innerJoin('app.absence_requests as r', 'r.id', 'd.absence_id')
			.select(['d.id', 'd.absence_id as absenceId', 'd.date', 'd.vacation_days as vacationDays'])
			.where('d.employee_id', '=', employeeId)
			.where('d.superseded_at', 'is', null)
			.where('d.date', '>=', from)
			.where('d.date', '<=', to)
			.where('r.type', '=', 'vacation')
			.where('r.status', 'in', ['approved', 'cancel_pending'])
			.orderBy('d.date')
			.execute();
	}

	// only from the expected status, a second decision racing this one then changes nothing
	async decide(
		trx: Trx,
		id: string,
		from: AbsenceStatus,
		to: AbsenceStatus,
		decision: Decision
	): Promise<boolean> {
		const updated = await trx
			.updateTable('app.absence_requests')
			.set({
				status: to,
				decided_by: decision.userId,
				decided_at: sql<string>`now()`,
				decision_note: decision.note
			})
			.where('id', '=', id)
			.where('status', '=', from)
			.executeTakeFirst();
		return updated.numUpdatedRows === 1n;
	}

	// withdraw and cancel come from the person; decided_by stays with the approver, a cancel reason
	// takes the note of the latest step
	async move(
		trx: Trx,
		id: string,
		from: AbsenceStatus,
		to: AbsenceStatus,
		note: string | null
	): Promise<boolean> {
		const updated = await trx
			.updateTable('app.absence_requests')
			.set({ status: to, ...(note !== null && { decision_note: note }) })
			.where('id', '=', id)
			.where('status', '=', from)
			.executeTakeFirst();
		return updated.numUpdatedRows === 1n;
	}

	async confirmCertificate(trx: Trx, id: string, userId: string): Promise<boolean> {
		const updated = await trx
			.updateTable('app.absence_requests')
			.set({ certificate_confirmed_at: sql<string>`now()`, certificate_confirmed_by: userId })
			.where('id', '=', id)
			.where('certificate_confirmed_at', 'is', null)
			.executeTakeFirst();
		return updated.numUpdatedRows === 1n;
	}

	// frees the dates for later requests, the unique index only counts days not superseded
	async supersede(
		trx: Trx,
		where: { absenceId: string } | { dayIds: string[] },
		by: string | null
	): Promise<void> {
		let query = trx
			.updateTable('app.absence_days')
			.set({ superseded_at: sql<string>`now()`, superseded_by: by })
			.where('superseded_at', 'is', null);
		query =
			'absenceId' in where
				? query.where('absence_id', '=', where.absenceId)
				: query.where('id', 'in', where.dayIds);
		await query.execute();
	}

	async find(trx: Trx, id: string): Promise<Absence | undefined> {
		const [absence] = await this.list(trx, (eb) => eb('r.id', '=', id), 1);
		return absence;
	}

	async list(trx: Trx, where: Filter, limit: number): Promise<Absence[]> {
		const rows = await absenceQuery(trx)
			.where(where)
			.orderBy('r.start_date')
			.orderBy('r.id')
			.limit(limit)
			.execute();
		const names = await this.vacation.userNames(
			trx,
			rows.flatMap((row) => [row.requested_by, row.decided_by, row.certificate_confirmed_by])
		);
		const ref = (id: string) => ({ id, displayName: names.get(id) ?? '' });

		return rows.map((row) => ({
			id: row.id,
			employee: { id: row.employee_id, name: row.employee_name },
			type: row.type,
			startDate: row.start_date,
			endDate: row.end_date,
			halfDayStart: row.half_day_start,
			halfDayEnd: row.half_day_end,
			status: row.status,
			note: row.note,
			vacationDays: row.vacation_days ?? '0.00',
			targetMinutes: row.target_minutes ?? 0,
			requestedBy: ref(row.requested_by),
			decidedBy: row.decided_by ? ref(row.decided_by) : null,
			decidedAt: row.decided_at,
			decisionNote: row.decision_note,
			sickNote:
				row.certificate_confirmed_at && row.certificate_confirmed_by
					? {
							confirmedAt: row.certificate_confirmed_at,
							confirmedBy: ref(row.certificate_confirmed_by)
						}
					: null,
			createdAt: row.created_at
		}));
	}
}
