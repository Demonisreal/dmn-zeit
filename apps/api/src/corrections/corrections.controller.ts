import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
	approveSchema,
	correctionsQuerySchema,
	createCorrectionSchema,
	emptyBodySchema,
	rejectSchema,
	uuidSchema
} from '@zeit/shared';
import type {
	ApproveInput,
	Correction,
	CorrectionPage,
	CorrectionsQuery,
	CreateCorrectionInput,
	RejectInput
} from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import { CorrectionsService } from './corrections.service';

@Controller('corrections')
@Roles('employee')
@Workspace('company')
export class CorrectionsController {
	constructor(private readonly corrections: CorrectionsService) {}

	@Post()
	create(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(createCorrectionSchema)) body: CreateCorrectionInput
	): Promise<Correction> {
		return this.corrections.create(session, body);
	}

	@Get()
	list(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(correctionsQuerySchema)) query: CorrectionsQuery
	): Promise<CorrectionPage> {
		return this.corrections.list(session, query);
	}

	@Post(':id/approve')
	@HttpCode(200)
	@Roles('team_lead')
	approve(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) id: string,
		@Body(new ZodPipe(approveSchema)) body: ApproveInput
	): Promise<Correction> {
		return this.corrections.approve(session, id, body);
	}

	@Post(':id/reject')
	@HttpCode(200)
	@Roles('team_lead')
	reject(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) id: string,
		@Body(new ZodPipe(rejectSchema)) body: RejectInput
	): Promise<Correction> {
		return this.corrections.reject(session, id, body);
	}

	@Post(':id/withdraw')
	@HttpCode(200)
	withdraw(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) id: string,
		@Body(new ZodPipe(emptyBodySchema)) _body: object
	): Promise<Correction> {
		return this.corrections.withdraw(session, id);
	}
}
