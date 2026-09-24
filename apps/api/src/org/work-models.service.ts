import { Injectable, NotFoundException } from '@nestjs/common';
import type {
	CreateWorkModelInput,
	UpdateWorkModelInput,
	WeekdayMinutes,
	WorkModel,
	WorkModelsQuery
} from '@zeit/shared';
import { sql, type RawBuilder, type Selectable } from 'kysely';
import type { AuthSession } from '../common/session.guard';
import { Database } from '../db/database';
import type { AppWorkModels } from '../db/schema.generated';

type MinuteColumns = Pick<
	AppWorkModels,
	'min_mon' | 'min_tue' | 'min_wed' | 'min_thu' | 'min_fri' | 'min_sat' | 'min_sun'
>;

export function minutesOf(row: MinuteColumns): WeekdayMinutes {
	return {
		mon: row.min_mon,
		tue: row.min_tue,
		wed: row.min_wed,
		thu: row.min_thu,
		fri: row.min_fri,
		sat: row.min_sat,
		sun: row.min_sun
	};
}

function columnsOf(minutes: WeekdayMinutes): MinuteColumns {
	return {
		min_mon: minutes.mon,
		min_tue: minutes.tue,
		min_wed: minutes.wed,
		min_thu: minutes.thu,
		min_fri: minutes.fri,
		min_sat: minutes.sat,
		min_sun: minutes.sun
	};
}

function toWorkModel(row: Selectable<AppWorkModels>): WorkModel {
	return { id: row.id, name: row.name, minutes: minutesOf(row), archivedAt: row.archived_at };
}

@Injectable()
export class WorkModelsService {
	constructor(private readonly db: Database) {}

	async list(session: AuthSession, query: WorkModelsQuery): Promise<WorkModel[]> {
		const rows = await this.db.withTenant(session, (trx) =>
			trx
				.selectFrom('app.work_models')
				.selectAll()
				.$if(!query.includeArchived, (qb) => qb.where('archived_at', 'is', null))
				.orderBy('name')
				.execute()
		);
		return rows.map(toWorkModel);
	}

	async create(session: AuthSession, input: CreateWorkModelInput): Promise<WorkModel> {
		const row = await this.db.withTenant(session, (trx) =>
			trx
				.insertInto('app.work_models')
				.values({ tenant_id: session.tenantId, name: input.name, ...columnsOf(input.minutes) })
				.returningAll()
				.executeTakeFirstOrThrow()
		);
		return toWorkModel(row);
	}

	async update(session: AuthSession, id: string, input: UpdateWorkModelInput): Promise<WorkModel> {
		let archivedAt: RawBuilder<string> | null | undefined;
		if (input.archived !== undefined) {
			// archiving twice keeps the first date
			archivedAt = input.archived ? sql<string>`coalesce(archived_at, now())` : null;
		}

		const row = await this.db.withTenant(session, (trx) => {
			if (Object.keys(input).length === 0) {
				return trx
					.selectFrom('app.work_models')
					.selectAll()
					.where('id', '=', id)
					.executeTakeFirst();
			}
			return trx
				.updateTable('app.work_models')
				.set({
					name: input.name,
					...(input.minutes && columnsOf(input.minutes)),
					archived_at: archivedAt
				})
				.where('id', '=', id)
				.returningAll()
				.executeTakeFirst();
		});
		if (!row) throw new NotFoundException('Work model not found');
		return toWorkModel(row);
	}
}
