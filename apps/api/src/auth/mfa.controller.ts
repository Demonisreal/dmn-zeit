import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { minutes, Throttle } from '@nestjs/throttler';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import { mfaRecoverySchema, mfaTotpSchema, passkeyAssertionSchema } from '@zeit/shared';
import type { MfaRecoveryInput, MfaTotpInput, PasskeyAssertionInput, Session } from '@zeit/shared';
import type { Request, Response } from 'express';
import { CurrentClient, type Client } from '../common/client.decorator';
import { Public } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { MfaService } from './mfa.service';
import { NotInDemoGuard } from './not-in-demo.guard';
import { WebAuthn } from './webauthn';

// the second step after the password and the login with a passkey alone
@Public()
@UseGuards(NotInDemoGuard)
@Throttle({ default: { limit: 10, ttl: minutes(1) } })
@Controller('auth')
export class MfaController {
	constructor(
		private readonly mfa: MfaService,
		private readonly webauthn: WebAuthn
	) {}

	@Post('mfa/totp')
	@HttpCode(200)
	totp(
		@Body(new ZodPipe(mfaTotpSchema)) body: MfaTotpInput,
		@Req() request: Request,
		@CurrentClient() client: Client,
		@Res({ passthrough: true }) response: Response
	): Promise<Session> {
		return this.mfa.totp(request, response, body.code, client);
	}

	@Post('mfa/recovery')
	@HttpCode(200)
	recovery(
		@Body(new ZodPipe(mfaRecoverySchema)) body: MfaRecoveryInput,
		@Req() request: Request,
		@CurrentClient() client: Client,
		@Res({ passthrough: true }) response: Response
	): Promise<Session> {
		return this.mfa.recovery(request, response, body.code, client);
	}

	@Post(['mfa/passkey/options', 'passkey/options'])
	@HttpCode(200)
	passkeyOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
		return this.webauthn.requestOptions('login', null);
	}

	@Post('mfa/passkey')
	@HttpCode(200)
	passkey(
		@Body(new ZodPipe(passkeyAssertionSchema)) body: PasskeyAssertionInput,
		@Req() request: Request,
		@CurrentClient() client: Client,
		@Res({ passthrough: true }) response: Response
	): Promise<Session> {
		return this.mfa.passkey(request, response, body.response, client);
	}

	@Post('passkey/verify')
	@HttpCode(200)
	passkeyLogin(
		@Body(new ZodPipe(passkeyAssertionSchema)) body: PasskeyAssertionInput,
		@CurrentClient() client: Client,
		@Res({ passthrough: true }) response: Response
	): Promise<Session> {
		return this.mfa.passkeyLogin(response, body.response, client);
	}
}
