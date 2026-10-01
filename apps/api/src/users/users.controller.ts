import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { hours, Throttle } from '@nestjs/throttler';
import { createUserSchema, updateUserSchema, uuidSchema } from '@zeit/shared';
import type { CreateUserInput, UpdateUserInput, User } from '@zeit/shared';
import { CurrentClient, type Client } from '../common/client.decorator';
import { CurrentSession } from '../common/current-session.decorator';
import { RequireReauth } from '../common/reauth.guard';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import { UsersService } from './users.service';

const id = new ZodPipe(uuidSchema);

@Roles('admin')
@Controller('users')
export class UsersController {
	constructor(private readonly users: UsersService) {}

	@Get()
	list(@CurrentSession() session: AuthSession): Promise<User[]> {
		return this.users.list(session);
	}

	@Post()
	@Workspace('company')
	@Throttle({ default: { limit: 20, ttl: hours(1) } })
	create(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(createUserSchema)) body: CreateUserInput,
		@CurrentClient() client: Client
	): Promise<User> {
		return this.users.create(session, body, client);
	}

	@Post(':id/invite')
	@Workspace('company')
	@HttpCode(204)
	@Throttle({ default: { limit: 20, ttl: hours(1) } })
	async invite(
		@CurrentSession() session: AuthSession,
		@Param('id', id) userId: string,
		@CurrentClient() client: Client
	) {
		await this.users.invite(session, userId, client);
	}

	@Patch(':id')
	@RequireReauth()
	update(
		@CurrentSession() session: AuthSession,
		@Param('id', id) userId: string,
		@Body(new ZodPipe(updateUserSchema)) body: UpdateUserInput
	): Promise<User> {
		return this.users.update(session, userId, body);
	}

	@Post(':id/disable')
	@HttpCode(200)
	@RequireReauth()
	disable(@CurrentSession() session: AuthSession, @Param('id', id) userId: string): Promise<User> {
		return this.users.disable(session, userId);
	}

	@Post(':id/enable')
	@HttpCode(200)
	@RequireReauth()
	enable(@CurrentSession() session: AuthSession, @Param('id', id) userId: string): Promise<User> {
		return this.users.enable(session, userId);
	}
}
