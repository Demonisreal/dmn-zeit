import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
	absencesQuerySchema,
	approveSchema,
	cancelAbsenceSchema,
	confirmSickNoteSchema,
	createAbsenceSchema,
	emptyBodySchema,
	rejectSchema,
	uuidSchema
} from '@zeit/shared';
import type {
	Absence,
	AbsencePage,
	AbsencePreview,
	AbsencesQuery,
	ApproveInput,
	CancelAbsenceInput,
	CreateAbsenceInput,
	RejectInput
} from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import { AbsencesService } from './absences.service';

const id = new ZodPipe(uuidSchema);

@Controller('absences')
@Workspace('company')
export class AbsencesController {
	constructor(private readonly absences: AbsencesService) {}

	@Post('preview')
	@HttpCode(200)
	preview(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(createAbsenceSchema)) body: CreateAbsenceInput
	): Promise<AbsencePreview> {
		return this.absences.preview(session, body);
	}

	@Post()
	create(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(createAbsenceSchema)) body: CreateAbsenceInput
	): Promise<Absence> {
		return this.absences.create(session, body);
	}

	@Get()
	list(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(absencesQuerySchema)) query: AbsencesQuery
	): Promise<AbsencePage> {
		return this.absences.list(session, query);
	}

	@Post(':id/approve')
	@HttpCode(200)
	@Roles('team_lead')
	approve(
		@CurrentSession() session: AuthSession,
		@Param('id', id) absenceId: string,
		@Body(new ZodPipe(approveSchema)) body: ApproveInput
	): Promise<Absence> {
		return this.absences.approve(session, absenceId, body);
	}

	@Post(':id/reject')
	@HttpCode(200)
	@Roles('team_lead')
	reject(
		@CurrentSession() session: AuthSession,
		@Param('id', id) absenceId: string,
		@Body(new ZodPipe(rejectSchema)) body: RejectInput
	): Promise<Absence> {
		return this.absences.reject(session, absenceId, body);
	}

	@Post(':id/withdraw')
	@HttpCode(200)
	withdraw(
		@CurrentSession() session: AuthSession,
		@Param('id', id) absenceId: string,
		@Body(new ZodPipe(emptyBodySchema)) _body: object
	): Promise<Absence> {
		return this.absences.withdraw(session, absenceId);
	}

	@Post(':id/cancel')
	@HttpCode(200)
	cancel(
		@CurrentSession() session: AuthSession,
		@Param('id', id) absenceId: string,
		@Body(new ZodPipe(cancelAbsenceSchema)) body: CancelAbsenceInput
	): Promise<Absence> {
		return this.absences.cancel(session, absenceId, body);
	}

	@Post(':id/confirm-sick-note')
	@HttpCode(200)
	@Roles('hr')
	confirmSickNote(
		@CurrentSession() session: AuthSession,
		@Param('id', id) absenceId: string,
		@Body(new ZodPipe(confirmSickNoteSchema)) _body: object
	): Promise<Absence> {
		return this.absences.confirmSickNote(session, absenceId);
	}
}
