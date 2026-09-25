import { Controller, Get, Param, Query } from '@nestjs/common';
import { projectSummaryQuerySchema, projectWeekQuerySchema, uuidSchema } from '@zeit/shared';
import type {
	ProjectSummary,
	ProjectSummaryQuery,
	ProjectWeek,
	ProjectWeekQuery
} from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import { mondayOf } from './project-engine';
import { ProjectWeekService } from './project-week.service';

@Controller()
@Roles('employee')
export class ProjectWeekController {
	constructor(private readonly weeks: ProjectWeekService) {}

	// any day picks its week, the answer names the monday in from
	@Get('employees/:id/project-week')
	week(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) id: string,
		@Query(new ZodPipe(projectWeekQuerySchema)) query: ProjectWeekQuery
	): Promise<ProjectWeek> {
		return this.weeks.week(session, id, mondayOf(query.from));
	}

	@Get('project-time/summary')
	@Roles('team_lead')
	@Workspace('company')
	summary(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(projectSummaryQuerySchema)) query: ProjectSummaryQuery
	): Promise<ProjectSummary> {
		return this.weeks.summary(session, query);
	}
}
