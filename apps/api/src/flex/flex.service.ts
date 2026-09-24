import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateFlexBookingInput, FlexBooking } from '@zeit/shared';
import { sql } from 'kysely';
import type { AuthSession } from '../common/session.guard';
import { Database } from '../db/database';
import { notOwnAccount } from '../vacation/vacation.service';

@Injectable()
export class FlexService {
	constructor(private readonly db: Database) {}

	// the balance itself is read in time/, this is only the manual side of the account
	book(
		session: AuthSession,
		employeeId: string,
		input: CreateFlexBookingInput
	): Promise<FlexBooking> {
		if (employeeId === session.employeeId) throw notOwnAccount();
		return this.db.withTenant(session, async (trx) => {
			const employee = await trx
				.selectFrom('app.employees')
				.select('id')
				.where('id', '=', employeeId)
				.executeTakeFirst();
			if (!employee) throw new NotFoundException('Employee not found');

			const booking = await trx
				.insertInto('app.flex_bookings')
				.values({
					tenant_id: sql<string>`app.tenant_id()`,
					employee_id: employeeId,
					type: input.type,
					minutes: input.minutes,
					effective_date: input.effectiveDate,
					reason: input.reason,
					created_by: session.userId
				})
				.returningAll()
				.executeTakeFirstOrThrow();
			const { rows } = await sql<{ display_name: string }>`
				select display_name from app.display_names(${[session.userId]}::uuid[])`.execute(trx);

			return {
				id: booking.id,
				employeeId: booking.employee_id,
				type: booking.type,
				minutes: booking.minutes,
				effectiveDate: booking.effective_date,
				reason: booking.reason,
				monthClosingId: booking.month_closing_id,
				createdBy: { id: session.userId, displayName: rows[0]?.display_name ?? '' },
				createdAt: booking.created_at
			};
		});
	}
}
