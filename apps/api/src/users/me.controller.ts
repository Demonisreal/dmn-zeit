import { Body, Controller, Get, Patch } from '@nestjs/common';
import { updateMeSchema } from '@zeit/shared';
import type { UpdateMeInput, User } from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { UsersService } from './users.service';

@Roles('employee')
@Controller('me')
export class MeController {
	constructor(private readonly users: UsersService) {}

	@Get()
	get(@CurrentSession() session: AuthSession): Promise<User> {
		return this.users.me(session);
	}

	@Patch()
	update(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(updateMeSchema)) body: UpdateMeInput
	): Promise<User> {
		return this.users.updateMe(session, body);
	}
}
