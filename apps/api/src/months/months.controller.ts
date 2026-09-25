import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { emptyBodySchema, monthSchema, reopenMonthSchema } from '@zeit/shared';
import type { MonthChecklist, MonthClosing, ReopenMonthInput } from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { RequireReauth } from '../common/reauth.guard';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import { MonthsService } from './months.service';

@Controller('months/:month')
@Roles('hr')
@Workspace('company')
export class MonthsController {
	constructor(private readonly months: MonthsService) {}

	@Get('checklist')
	checklist(
		@CurrentSession() session: AuthSession,
		@Param('month', new ZodPipe(monthSchema)) month: string
	): Promise<MonthChecklist> {
		return this.months.checklist(session, month);
	}

	@Post('close')
	close(
		@CurrentSession() session: AuthSession,
		@Param('month', new ZodPipe(monthSchema)) month: string,
		@Body(new ZodPipe(emptyBodySchema)) _body: object
	): Promise<MonthClosing> {
		return this.months.close(session, month);
	}

	@Post('reopen')
	@Roles('admin')
	@RequireReauth()
	reopen(
		@CurrentSession() session: AuthSession,
		@Param('month', new ZodPipe(monthSchema)) month: string,
		@Body(new ZodPipe(reopenMonthSchema)) body: ReopenMonthInput
	): Promise<MonthClosing> {
		return this.months.reopen(session, month, body);
	}
}
