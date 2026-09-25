import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { noteSchema, startTimerSchema } from '@zeit/shared';
import type { ProjectTimer, StartTimerInput } from '@zeit/shared';
import { z } from 'zod';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { ProjectTimerService } from './project-timer.service';

const stopSchema = z.strictObject({ note: noteSchema.optional() });

@Controller('project-timer')
@Roles('employee')
export class ProjectTimerController {
	constructor(private readonly timer: ProjectTimerService) {}

	@Get()
	state(@CurrentSession() session: AuthSession): Promise<ProjectTimer> {
		return this.timer.state(session);
	}

	@Post('start')
	@HttpCode(200)
	start(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(startTimerSchema)) body: StartTimerInput
	): Promise<ProjectTimer> {
		return this.timer.start(session, body);
	}

	@Post('stop')
	@HttpCode(200)
	stop(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(stopSchema)) body: z.infer<typeof stopSchema>
	): Promise<ProjectTimer> {
		return this.timer.stop(session, body.note);
	}
}
