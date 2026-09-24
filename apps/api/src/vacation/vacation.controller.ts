import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { hours, Throttle } from '@nestjs/throttler';
import {
	createVacationAdjustmentSchema,
	createVacationNoticesSchema,
	emptyBodySchema,
	uuidSchema,
	vacationNoticesQuerySchema,
	vacationQuerySchema
} from '@zeit/shared';
import type {
	CreateVacationAdjustmentInput,
	CreateVacationNoticesInput,
	VacationAccount,
	VacationLedgerEntry,
	VacationNotice,
	VacationNoticesQuery,
	VacationQuery
} from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { VacationService } from './vacation.service';

@Controller()
export class VacationController {
	constructor(private readonly vacation: VacationService) {}

	@Get('employees/:id/vacation')
	account(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) employeeId: string,
		@Query(new ZodPipe(vacationQuerySchema)) query: VacationQuery
	): Promise<VacationAccount> {
		return this.vacation.account(session, employeeId, query.year);
	}

	@Post('employees/:id/vacation/adjustments')
	@Roles('hr')
	adjust(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) employeeId: string,
		@Body(new ZodPipe(createVacationAdjustmentSchema)) body: CreateVacationAdjustmentInput
	): Promise<VacationLedgerEntry> {
		return this.vacation.adjust(session, employeeId, body);
	}

	// one call reaches up to 500 people, by mail too
	@Post('vacation/notices')
	@Roles('hr')
	@Throttle({ default: { limit: 10, ttl: hours(1) } })
	sendNotices(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(createVacationNoticesSchema)) body: CreateVacationNoticesInput
	): Promise<VacationNotice[]> {
		return this.vacation.sendNotices(session, body);
	}

	@Get('vacation/notices')
	notices(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(vacationNoticesQuerySchema)) query: VacationNoticesQuery
	): Promise<VacationNotice[]> {
		return this.vacation.notices(session, query.year);
	}

	@Post('me/vacation/notices/:id/acknowledge')
	@HttpCode(200)
	acknowledge(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) id: string,
		@Body(new ZodPipe(emptyBodySchema)) _body: object
	): Promise<VacationNotice> {
		return this.vacation.acknowledge(session, id);
	}
}
