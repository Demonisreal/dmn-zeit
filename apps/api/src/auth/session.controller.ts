import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	NotFoundException,
	Param,
	Post,
	Req,
	Res
} from '@nestjs/common';
import { minutes, Throttle } from '@nestjs/throttler';
import { changePasswordSchema, uuidSchema } from '@zeit/shared';
import type { ActiveSession, ChangePasswordInput, Session } from '@zeit/shared';
import type { Request, Response } from 'express';
import { CurrentClient, type Client } from '../common/client.decorator';
import { CurrentSession } from '../common/current-session.decorator';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

@Controller('auth')
export class SessionController {
	constructor(
		private readonly sessions: SessionService,
		private readonly auth: AuthService
	) {}

	@Get('session')
	current(@CurrentSession() session: AuthSession, @Req() request: Request): Promise<Session> {
		return this.sessions.current(session, request);
	}

	@Post('logout')
	@HttpCode(204)
	async logout(
		@CurrentSession() session: AuthSession,
		@Res({ passthrough: true }) response: Response
	) {
		await this.sessions.revoke(session, session.id, response);
	}

	@Post('password/change')
	@HttpCode(200)
	@Throttle({ default: { limit: 10, ttl: minutes(1) } })
	async changePassword(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(changePasswordSchema)) body: ChangePasswordInput,
		@CurrentClient() client: Client,
		@Res({ passthrough: true }) response: Response
	): Promise<Session> {
		await this.auth.changePassword(session, body);
		return this.sessions.open(response, session.userId, client);
	}

	@Get('sessions')
	list(@CurrentSession() session: AuthSession): Promise<ActiveSession[]> {
		return this.sessions.list(session);
	}

	@Delete('sessions/:id')
	@HttpCode(204)
	async revoke(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) id: string,
		@Res({ passthrough: true }) response: Response
	) {
		if (!(await this.sessions.revoke(session, id, response))) {
			throw new NotFoundException('Session not found');
		}
	}
}
