import { Body, Controller, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { hours, minutes, Throttle } from '@nestjs/throttler';
import {
	acceptInvitationSchema,
	forgotPasswordSchema,
	inspectInvitationSchema,
	loginSchema,
	resetPasswordSchema
} from '@zeit/shared';
import type {
	AcceptInvitationInput,
	ForgotPasswordInput,
	InspectInvitationInput,
	Invitation,
	LoginInput,
	LoginResult,
	ResetPasswordInput,
	Session
} from '@zeit/shared';
import type { Response } from 'express';
import { CurrentClient, type Client } from '../common/client.decorator';
import { Public } from '../common/session.guard';
import { ThrottlePerEmail } from '../common/throttle';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { NotInDemoGuard } from './not-in-demo.guard';
import { SessionService } from './session.service';

@Public()
@UseGuards(NotInDemoGuard)
@Controller('auth')
export class AuthController {
	constructor(
		private readonly auth: AuthService,
		private readonly mfa: MfaService,
		private readonly sessions: SessionService
	) {}

	@Post('login')
	@HttpCode(200)
	@Throttle({ default: { limit: 10, ttl: minutes(1) } })
	async login(
		@Body(new ZodPipe(loginSchema)) body: LoginInput,
		@CurrentClient() client: Client,
		@Res({ passthrough: true }) response: Response
	): Promise<LoginResult> {
		const userId = await this.auth.login(body, client);
		const methods = await this.mfa.methodsFor(userId);
		if (methods.length > 0) return this.mfa.challenge(response, userId, methods);
		// without any second factor the session only reaches the setup, the database marks it so
		return this.mfa.signIn(response, userId, client, 'password');
	}

	@Post('password/forgot')
	@HttpCode(204)
	@ThrottlePerEmail()
	@Throttle({ default: { limit: 10, ttl: hours(1) } })
	forgotPassword(
		@Body(new ZodPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
		@CurrentClient() client: Client
	) {
		this.auth.forgotPassword(body.email, client.requestId);
	}

	@Post('password/reset')
	@HttpCode(204)
	async resetPassword(
		@Body(new ZodPipe(resetPasswordSchema)) body: ResetPasswordInput,
		@CurrentClient() client: Client
	) {
		await this.auth.resetPassword(body, client.requestId);
	}

	@Post('invitations/inspect')
	@HttpCode(200)
	inspectInvitation(
		@Body(new ZodPipe(inspectInvitationSchema)) body: InspectInvitationInput
	): Promise<Invitation> {
		return this.auth.inspectInvitation(body.token);
	}

	// straight into a session that can only set up the second factor
	@Post('invitations/accept')
	@HttpCode(200)
	async acceptInvitation(
		@Body(new ZodPipe(acceptInvitationSchema)) body: AcceptInvitationInput,
		@CurrentClient() client: Client,
		@Res({ passthrough: true }) response: Response
	): Promise<Session> {
		const userId = await this.auth.acceptInvitation(body, client.requestId);
		return this.sessions.open(response, userId, client);
	}
}
