import { ForbiddenException } from '@nestjs/common';
import { hasRole } from '@zeit/shared';
import { sql } from 'kysely';
import type { Trx } from '../db/database';
import type { AuthSession } from './session.guard';

// needs the trx of withTenant, app.leads reads the lead from app.user_id; RLS checks the same again
export async function assertCanSee(
	trx: Trx,
	session: AuthSession,
	employeeId: string
): Promise<void> {
	if (employeeId === session.employeeId || hasRole(session.role, 'hr')) return;

	if (session.role === 'team_lead') {
		const { rows } = await sql<{ leads: boolean }>`
			select app.leads(${employeeId}) as leads`.execute(trx);
		if (rows[0]?.leads) return;
	}
	throw new ForbiddenException('Not allowed to see this employee');
}
