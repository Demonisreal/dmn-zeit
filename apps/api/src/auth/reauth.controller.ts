import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { minutes, Throttle } from '@nestjs/throttler';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import { passkeyAssertionSchema, reauthSchema } from '@zeit/shared';
import type { PasskeyAssertionInput, ReauthInput, ReauthResult } from '@zeit/shared';
import { CurrentClient, type Client } from '../common/client.decorator';
import { CurrentSession } from '../common/current-session.decorator';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { MfaService } from './mfa.service';
import { WebAuthn } from './webauthn';

// step-up: password with an authenticator code, or a passkey; recovery codes do not count here
@Throttle({ default: { limit: 10, ttl: minutes(1) } })
@Controller('auth/reauth')
export class ReauthController {
	constructor(
		private readonly mfa: MfaService,
		private readonly webauthn: WebAuthn
	) {}

	@Post()
	@HttpCode(200)
	reauth(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(reauthSchema)) body: ReauthInput,
		@CurrentClient() client: Client
	): Promise<ReauthResult> {
		return this.mfa.reauth(session, body, client);
	}

	@Post('passkey/options')
	@HttpCode(200)
	passkeyOptions(
		@CurrentSession() session: AuthSession
	): Promise<PublicKeyCredentialRequestOptionsJSON> {
		return this.webauthn.requestOptions('reauth', session.userId);
	}

	@Post('passkey')
	@HttpCode(200)
	passkey(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(passkeyAssertionSchema)) body: PasskeyAssertionInput,
		@CurrentClient() client: Client
	): Promise<ReauthResult> {
		return this.mfa.reauthWithPasskey(session, body.response, client);
	}
}
