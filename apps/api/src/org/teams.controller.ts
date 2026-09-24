import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { createTeamSchema, teamLeadsSchema, updateTeamSchema, uuidSchema } from '@zeit/shared';
import type { CreateTeamInput, Team, TeamLeadsInput, UpdateTeamInput } from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { TeamsService } from './teams.service';

const id = new ZodPipe(uuidSchema);

@Roles('hr')
@Controller('teams')
export class TeamsController {
	constructor(private readonly teams: TeamsService) {}

	@Get()
	list(@CurrentSession() session: AuthSession): Promise<Team[]> {
		return this.teams.list(session);
	}

	@Post()
	create(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(createTeamSchema)) body: CreateTeamInput
	): Promise<Team> {
		return this.teams.create(session, body);
	}

	@Patch(':id')
	update(
		@CurrentSession() session: AuthSession,
		@Param('id', id) teamId: string,
		@Body(new ZodPipe(updateTeamSchema)) body: UpdateTeamInput
	): Promise<Team> {
		return this.teams.update(session, teamId, body);
	}

	@Put(':id/leads')
	setLeads(
		@CurrentSession() session: AuthSession,
		@Param('id', id) teamId: string,
		@Body(new ZodPipe(teamLeadsSchema)) body: TeamLeadsInput
	): Promise<Team> {
		return this.teams.setLeads(session, teamId, body);
	}
}
