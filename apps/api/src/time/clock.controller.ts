import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { emptyBodySchema } from '@zeit/shared';
import type { Clock } from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import { ClockService } from './clock.service';

const empty = new ZodPipe(emptyBodySchema);

@Controller('clock')
@Roles('employee')
@Workspace('company')
export class ClockController {
	constructor(private readonly clock: ClockService) {}

	@Get()
	state(@CurrentSession() session: AuthSession): Promise<Clock> {
		return this.clock.state(session);
	}

	@Post('in')
	@HttpCode(200)
	clockIn(@CurrentSession() session: AuthSession, @Body(empty) _body: object): Promise<Clock> {
		return this.clock.clockIn(session);
	}

	@Post('break')
	@HttpCode(200)
	pause(@CurrentSession() session: AuthSession, @Body(empty) _body: object): Promise<Clock> {
		return this.clock.pause(session);
	}

	@Post('resume')
	@HttpCode(200)
	resume(@CurrentSession() session: AuthSession, @Body(empty) _body: object): Promise<Clock> {
		return this.clock.resume(session);
	}

	@Post('out')
	@HttpCode(200)
	clockOut(@CurrentSession() session: AuthSession, @Body(empty) _body: object): Promise<Clock> {
		return this.clock.clockOut(session);
	}
}
