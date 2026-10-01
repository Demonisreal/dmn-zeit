import { Injectable } from '@nestjs/common';
import { hasRole, type AckFindingInput } from '@zeit/shared';
import { sql } from 'kysely';
import type { AuthSession } from '../common/session.guard';
import type { Trx } from '../db/database';
import type { DateRange } from '../time/time.store';

@Injectable()
export class ComplianceStore {
	async reviewable(trx: Trx, reader: AuthSession, range: DateRange): Promise<string[]> {
		let select = trx
			.selectFrom('app.employees')
			.select('id')
			.where('entry_date', '<=', range.to)
			.where((eb) => eb.or([eb('exit_date', 'is', null), eb('exit_date', '>=', range.from)]));
		if (!hasRole(reader.role, 'hr')) select = select.where(sql<boolean>`app.leads(id)`);
		const rows = await select.execute();
		return rows.map((row) => row.id);
	}

	async ack(trx: Trx, reader: AuthSession, input: AckFindingInput): Promise<void> {
		await trx
			.insertInto('app.finding_acks')
			.values({
				tenant_id: reader.tenantId,
				employee_id: input.employeeId,
				work_date: input.date,
				rule_code: input.code,
				rule_version: input.ruleVersion,
				note: input.note,
				created_by: reader.userId
			})
			.execute();
	}
}
