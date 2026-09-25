import { Controller, Get, Query } from '@nestjs/common';
import { teamCalendarQuerySchema } from '@zeit/shared';
import type { TeamCalendar, TeamCalendarQuery } from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import { AbsencesService } from './absences.service';

@Controller('team-calendar')
@Workspace('company')
export class TeamCalendarController {
	constructor(private readonly absences: AbsencesService) {}

	@Get()
	calendar(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(teamCalendarQuerySchema)) query: TeamCalendarQuery
	): Promise<TeamCalendar> {
		return this.absences.teamCalendar(session, query);
	}
}
