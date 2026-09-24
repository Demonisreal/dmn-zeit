import { Injectable } from '@nestjs/common';
import type {
	Correction,
	CorrectionAction,
	CorrectionStatus,
	CorrectionsQuery
} from '@zeit/shared';
import { sql } from 'kysely';
import type { AuthSession } from '../common/session.guard';
import type { Trx } from '../db/database';
import { displayNames, type Cursor } from '../time/time.store';

export type NewCorrection = {
	employeeId: string;
	action: CorrectionAction;
	targetEntryId: string | null;
	startedAt: string | null;
	endedAt: string | null;
	reason: string;
	// hr correcting someone else: approved by the requester in the same step
	direct: boolean;
};

export type Actor = { tenantId: string; userId: string };

export type Decision = {
	status: Extract<CorrectionStatus, 'approved' | 'rejected'>;
	note: string | null;
};

@Injectable()
export class CorrectionsStore {
	async find(trx: Trx, id: string): Promise<Correction | undefined> {
		const [correction] = await this.corrections(trx, this.select(trx).where('c.id', '=', id));
		return correction;
	}

	// mine: about my own times; inbox: pending ones I may decide; all: what my role reaches
	page(
		trx: Trx,
		reader: AuthSession,
		query: CorrectionsQuery,
		after: Cursor | undefined
	): Promise<Correction[]> {
		let select = this.select(trx)
			.where(
				'c.created_at',
				'>=',
				sql<string>`${query.from}::date::timestamp at time zone 'Europe/Berlin'`
			)
			.where(
				'c.created_at',
				'<',
				sql<string>`(${query.to}::date + 1)::timestamp at time zone 'Europe/Berlin'`
			);

		if (query.scope === 'mine') {
			select = select.where(sql<boolean>`c.employee_id = ${reader.employeeId}::uuid`);
		} else if (query.scope === 'inbox') {
			select = select
				.where('c.status', '=', 'pending')
				.where('c.requested_by', '<>', reader.userId)
				.where(sql<boolean>`c.employee_id is distinct from ${reader.employeeId}::uuid`);
		}
		if (query.scope !== 'mine' && reader.role === 'team_lead') {
			select = select.where(sql<boolean>`app.leads(c.employee_id)`);
		}
		if (query.employee) select = select.where('c.employee_id', '=', query.employee);
		if (query.status) select = select.where('c.status', 'in', query.status);
		if (after) {
			select = select.where((eb) =>
				eb(eb.refTuple('c.created_at', 'c.id'), '<', eb.tuple(after.at, after.id))
			);
		}

		return this.corrections(
			trx,
			select
				.orderBy('c.created_at', 'desc')
				.orderBy('c.id', 'desc')
				.limit(query.limit + 1)
		);
	}

	entry(trx: Trx, id: string) {
		return trx
			.selectFrom('app.time_entries')
			.select([
				'id',
				'employee_id as employeeId',
				'started_at as startedAt',
				'voided_at as voidedAt'
			])
			.where('id', '=', id)
			.executeTakeFirst();
	}

	// a pending request on a closed month could never be approved
	async touchesClosedMonth(trx: Trx, employeeId: string, stamps: string[]): Promise<boolean> {
		const { rows } = await sql<{ locked: boolean }>`
			select exists (
				select 1
				  from app.employees e, unnest(${stamps}::timestamptz[]) as s (at)
				 where e.id = ${employeeId}
				   and (s.at at time zone 'Europe/Berlin')::date <= e.closed_through
			) as locked`.execute(trx);
		return rows[0]?.locked === true;
	}

	async insert(trx: Trx, actor: Actor, correction: NewCorrection): Promise<string> {
		const { id } = await trx
			.insertInto('app.correction_requests')
			.values({
				tenant_id: actor.tenantId,
				employee_id: correction.employeeId,
				action: correction.action,
				target_entry_id: correction.targetEntryId,
				new_started_at: correction.startedAt,
				new_ended_at: correction.endedAt,
				reason: correction.reason,
				requested_by: actor.userId,
				status: correction.direct ? 'approved' : 'pending',
				decided_by: correction.direct ? actor.userId : null,
				decided_at: correction.direct ? sql<string>`now()` : null
			})
			.returning('id')
			.executeTakeFirstOrThrow();
		return id;
	}

	async decide(trx: Trx, id: string, userId: string, decision: Decision): Promise<boolean> {
		const decided = await trx
			.updateTable('app.correction_requests')
			.set({
				status: decision.status,
				decided_by: userId,
				decided_at: sql<string>`now()`,
				decision_note: decision.note
			})
			.where('id', '=', id)
			.where('status', '=', 'pending')
			.executeTakeFirst();
		return decided.numUpdatedRows > 0n;
	}

	async withdraw(trx: Trx, id: string): Promise<boolean> {
		const withdrawn = await trx
			.updateTable('app.correction_requests')
			.set({ status: 'withdrawn' })
			.where('id', '=', id)
			.where('status', '=', 'pending')
			.executeTakeFirst();
		return withdrawn.numUpdatedRows > 0n;
	}

	async voidEntry(trx: Trx, entryId: string, requestId: string): Promise<boolean> {
		const voided = await trx
			.updateTable('app.time_entries')
			.set({ voided_at: sql<string>`now()`, voided_by_request_id: requestId })
			.where('id', '=', entryId)
			.where('voided_at', 'is', null)
			.executeTakeFirst();
		return voided.numUpdatedRows > 0n;
	}

	async addEntry(
		trx: Trx,
		actor: Actor,
		entry: { employeeId: string; startedAt: string; endedAt: string; requestId: string }
	): Promise<void> {
		await trx
			.insertInto('app.time_entries')
			.values({
				tenant_id: actor.tenantId,
				employee_id: entry.employeeId,
				started_at: entry.startedAt,
				ended_at: entry.endedAt,
				source: 'correction',
				request_id: entry.requestId,
				created_by: actor.userId
			})
			.execute();
	}

	private select(trx: Trx) {
		return trx
			.selectFrom('app.correction_requests as c')
			.innerJoin('app.employees as e', 'e.id', 'c.employee_id')
			.leftJoin('app.time_entries as t', 't.id', 'c.target_entry_id')
			.select([
				'c.id',
				'c.employee_id',
				sql<string>`e.first_name || ' ' || e.last_name`.as('employee_name'),
				'c.action',
				'c.target_entry_id',
				't.started_at as target_started_at',
				't.ended_at as target_ended_at',
				'c.new_started_at',
				'c.new_ended_at',
				'c.reason',
				'c.status',
				'c.requested_by',
				'c.decided_by',
				'c.decided_at',
				'c.decision_note',
				'c.created_at'
			]);
	}

	private async corrections(
		trx: Trx,
		select: ReturnType<CorrectionsStore['select']>
	): Promise<Correction[]> {
		const rows = await select.execute();
		const names = await displayNames(
			trx,
			rows.flatMap((row) =>
				row.decided_by ? [row.requested_by, row.decided_by] : [row.requested_by]
			)
		);
		const userRef = (id: string) => ({ id, displayName: names.get(id) ?? '' });

		return rows.map((row) => ({
			id: row.id,
			employee: { id: row.employee_id, name: row.employee_name },
			action: row.action,
			target:
				row.target_entry_id && row.target_started_at
					? {
							entryId: row.target_entry_id,
							startedAt: row.target_started_at,
							endedAt: row.target_ended_at
						}
					: null,
			newStartedAt: row.new_started_at,
			newEndedAt: row.new_ended_at,
			reason: row.reason,
			status: row.status,
			requestedBy: userRef(row.requested_by),
			decidedBy: row.decided_by ? userRef(row.decided_by) : null,
			decidedAt: row.decided_at,
			decisionNote: row.decision_note,
			createdAt: row.created_at
		}));
	}
}
