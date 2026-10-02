import { Injectable } from '@nestjs/common';
import type {
	CreateProjectEntryInput,
	ProjectEntry,
	StartTimerInput,
	UpdateProjectEntryInput
} from '@zeit/shared';
import { sql } from 'kysely';
import type { Client } from '../common/client.decorator';
import type { TenantContext, Trx } from '../db/database';
import type { Cursor, DateRange } from '../time/time.store';

const entryColumns = [
	'id',
	'employee_id as employeeId',
	'project_id as projectId',
	'task_id as taskId',
	'started_at as startedAt',
	'ended_at as endedAt',
	'workday',
	'note',
	'billable',
	'source',
	'invoice_id as invoiceId',
	'voided_at as voidedAt'
] as const;

@Injectable()
export class ProjectEntriesStore {
	page(
		trx: Trx,
		employeeId: string,
		range: DateRange,
		after: Cursor | undefined,
		limit: number
	): Promise<ProjectEntry[]> {
		let query = trx
			.selectFrom('app.project_entries')
			.select(entryColumns)
			.where('employee_id', '=', employeeId)
			.where('voided_at', 'is', null)
			.where('workday', '>=', range.from)
			.where('workday', '<=', range.to);
		if (after) {
			query = query.where((eb) =>
				eb(eb.refTuple('started_at', 'id'), '>', eb.tuple(after.at, after.id))
			);
		}
		return query.orderBy('started_at').orderBy('id').limit(limit).execute();
	}

	between(
		trx: Trx,
		range: DateRange,
		filter: { employeeId?: string | undefined; team?: string | undefined }
	): Promise<ProjectEntry[]> {
		return trx
			.selectFrom('app.project_entries')
			.select(entryColumns)
			.where('voided_at', 'is', null)
			.where('workday', '>=', range.from)
			.where('workday', '<=', range.to)
			.$if(filter.employeeId !== undefined, (qb) =>
				qb.where('employee_id', '=', filter.employeeId!)
			)
			.$if(filter.team !== undefined, (qb) =>
				qb.where('employee_id', 'in', (eb) =>
					eb.selectFrom('app.employees').select('id').where('team_id', '=', filter.team!)
				)
			)
			.orderBy('started_at')
			.execute();
	}

	finished(trx: Trx, projectIds: readonly string[]): Promise<ProjectEntry[]> {
		if (projectIds.length === 0) return Promise.resolve([]);
		return trx
			.selectFrom('app.project_entries')
			.select(entryColumns)
			.where('project_id', 'in', projectIds)
			.where('voided_at', 'is', null)
			.where('ended_at', 'is not', null)
			.execute();
	}

	entry(trx: Trx, id: string): Promise<ProjectEntry | undefined> {
		return trx
			.selectFrom('app.project_entries')
			.select(entryColumns)
			.where('id', '=', id)
			.executeTakeFirst();
	}

	running(trx: Trx, employeeId: string): Promise<ProjectEntry | undefined> {
		return trx
			.selectFrom('app.project_entries')
			.select(entryColumns)
			.where('employee_id', '=', employeeId)
			.where('ended_at', 'is', null)
			.where('voided_at', 'is', null)
			.executeTakeFirst();
	}

	async hasEmployee(trx: Trx, employeeId: string): Promise<boolean> {
		const employee = await trx
			.selectFrom('app.employees')
			.select('id')
			.where('id', '=', employeeId)
			.executeTakeFirst();
		return employee !== undefined;
	}

	async startTimer(
		trx: Trx,
		ctx: TenantContext,
		employeeId: string,
		input: StartTimerInput
	): Promise<void> {
		await trx
			.insertInto('app.project_entries')
			.values({
				tenant_id: ctx.tenantId,
				employee_id: employeeId,
				project_id: input.projectId,
				task_id: input.taskId,
				note: input.note,
				source: 'timer',
				created_by: ctx.userId
			})
			.execute();
	}

	async stopRunning(trx: Trx, employeeId: string, note?: string): Promise<boolean> {
		const stopped = await trx
			.updateTable('app.project_entries')
			.set({ ended_at: sql<string>`now()`, note })
			.where('employee_id', '=', employeeId)
			.where('ended_at', 'is', null)
			.where('voided_at', 'is', null)
			.executeTakeFirst();
		return stopped.numUpdatedRows > 0n;
	}

	insert(
		trx: Trx,
		ctx: TenantContext,
		employeeId: string,
		input: CreateProjectEntryInput
	): Promise<ProjectEntry> {
		return trx
			.insertInto('app.project_entries')
			.values({
				tenant_id: ctx.tenantId,
				employee_id: employeeId,
				project_id: input.projectId,
				task_id: input.taskId,
				started_at: input.startedAt,
				ended_at: input.endedAt,
				note: input.note,
				billable: input.billable,
				source: 'manual',
				created_by: ctx.userId
			})
			.returning(entryColumns)
			.executeTakeFirstOrThrow();
	}

	update(trx: Trx, id: string, input: UpdateProjectEntryInput): Promise<ProjectEntry | undefined> {
		return trx
			.updateTable('app.project_entries')
			.set({
				project_id: input.projectId,
				task_id: input.taskId,
				started_at: input.startedAt,
				ended_at: input.endedAt,
				note: input.note,
				billable: input.billable
			})
			.where('id', '=', id)
			.returning(entryColumns)
			.executeTakeFirst();
	}

	voidEntry(trx: Trx, id: string): Promise<ProjectEntry | undefined> {
		return trx
			.updateTable('app.project_entries')
			.set({ voided_at: sql<string>`now()` })
			.where('id', '=', id)
			.where('voided_at', 'is', null)
			.returning(entryColumns)
			.executeTakeFirst();
	}

	async bookedForOther(
		trx: Trx,
		ctx: TenantContext,
		entry: ProjectEntry,
		reason: string,
		client: Client
	): Promise<void> {
		await trx
			.insertInto('audit.log')
			.values({
				tenant_id: ctx.tenantId,
				actor_user_id: ctx.userId,
				actor_role: ctx.role,
				source: 'app',
				action: 'project_entry.booked_for_other',
				table_name: 'project_entries',
				row_id: entry.id,
				subject_employee_id: entry.employeeId,
				diff: { reason },
				request_id: client.requestId,
				ip: client.ip
			})
			.execute();
	}
}
