import { Controller, Get, Query, Res } from '@nestjs/common';
import { monthOverviewQuerySchema, timesheetQuerySchema } from '@zeit/shared';
import type { MonthOverview, MonthOverviewQuery, Timesheet, TimesheetQuery } from '@zeit/shared';
import type { Response } from 'express';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { ExportsService, type Download } from './exports.service';

function attach(response: Response, download: Download): string {
	response.setHeader('Content-Type', 'text/csv; charset=utf-8');
	response.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);
	return download.body;
}

@Controller('exports')
export class ExportsController {
	constructor(private readonly exports: ExportsService) {}

	// whose sheet the reader may have is checked per person in the service
	@Get('timesheet')
	@Roles('employee')
	async timesheet(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(timesheetQuerySchema)) query: TimesheetQuery,
		@Res({ passthrough: true }) response: Response
	): Promise<Timesheet | string> {
		if (query.format === 'json') {
			return this.exports.timesheet(session, query.employee, query.month);
		}
		return attach(response, await this.exports.timesheetCsv(session, query.employee, query.month));
	}

	// sick days of the whole tenant are payroll matters, not something for leads or colleagues
	@Get('month-overview')
	@Roles('hr')
	async monthOverview(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(monthOverviewQuerySchema)) query: MonthOverviewQuery,
		@Res({ passthrough: true }) response: Response
	): Promise<MonthOverview | string> {
		if (query.format === 'json') return this.exports.overview(session, query.month);
		return attach(response, await this.exports.overviewCsv(session, query.month));
	}
}
