import { Controller, Get, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import {
	monthOverviewQuerySchema,
	timeReportQuerySchema,
	timesheetQuerySchema
} from '@zeit/shared';
import type {
	MonthOverview,
	MonthOverviewQuery,
	Timesheet,
	TimeReportQuery,
	TimesheetQuery
} from '@zeit/shared';
import type { Response } from 'express';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import type { TimeReport } from '../documents/time-report';
import { RenderLimitGuard } from '../documents/render-limit.guard';
import { UserRateLimit, UserRateLimitGuard } from '../invoices/user-rate-limit.guard';
import { ExportsService, type Download } from './exports.service';

export function contentDisposition(filename: string): string {
	const ascii = filename.replace(/[^\w.-]/g, '_');
	const encoded = encodeURIComponent(filename).replace(
		/['()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
	);
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function attach(response: Response, download: Download): string {
	response.setHeader('Content-Type', 'text/csv; charset=utf-8');
	response.setHeader('Content-Disposition', contentDisposition(download.filename));
	return download.body;
}

@Controller('exports')
export class ExportsController {
	constructor(private readonly exports: ExportsService) {}

	@Get('timesheet')
	@Workspace('company')
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

	@Get('month-overview')
	@Workspace('company')
	@Roles('hr')
	async monthOverview(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(monthOverviewQuerySchema)) query: MonthOverviewQuery,
		@Res({ passthrough: true }) response: Response
	): Promise<MonthOverview | string> {
		if (query.format === 'json') return this.exports.overview(session, query.month);
		return attach(response, await this.exports.overviewCsv(session, query.month));
	}

	@Get('time-report')
	@Roles('hr')
	@UseGuards(RenderLimitGuard, UserRateLimitGuard)
	@UserRateLimit('exports-time-report', 20)
	async timeReport(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(timeReportQuerySchema)) query: TimeReportQuery,
		@Res({ passthrough: true }) response: Response
	): Promise<TimeReport | StreamableFile | string> {
		const report = await this.exports.timeReport(session, query);
		if (Buffer.isBuffer(report)) {
			response.setHeader('Cache-Control', 'no-store');
			response.setHeader('Content-Type', 'application/pdf');
			response.setHeader('Content-Disposition', 'attachment; filename="time-report.pdf"');
			return new StreamableFile(report);
		}
		if ('body' in report) {
			response.setHeader('Cache-Control', 'no-store');
			response.setHeader('Content-Type', 'text/csv; charset=utf-8');
			response.setHeader('Content-Disposition', contentDisposition(report.filename));
			return report.body;
		}
		return report;
	}
}
