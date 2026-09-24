import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { minutes, Throttle } from '@nestjs/throttler';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/server';
import { createPasskeySchema, mfaTotpSchema, renamePasskeySchema, uuidSchema } from '@zeit/shared';
import type {
	CreatePasskeyInput,
	MfaTotpInput,
	PasskeyCreated,
	RecoveryCodes,
	RenamePasskeyInput,
	SecurityOverview,
	TotpSetup
} from '@zeit/shared';
import { CurrentClient, type Client } from '../common/client.decorator';
import { CurrentSession } from '../common/current-session.decorator';
import { AllowDuringEnrollment } from '../common/enrollment.guard';
import { RequireReauth } from '../common/reauth.guard';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { SecurityService } from './security.service';

const tight = { default: { limit: 10, ttl: minutes(1) } };

// the own sign-in methods; setting up the first one is what an enrollment session is for
@Controller('security')
export class SecurityController {
	constructor(private readonly security: SecurityService) {}

	@Get()
	@AllowDuringEnrollment()
	overview(@CurrentSession() session: AuthSession): Promise<SecurityOverview> {
		return this.security.overview(session);
	}

	@Post('totp/setup')
	@HttpCode(200)
	@AllowDuringEnrollment()
	@Throttle(tight)
	startTotp(@CurrentSession() session: AuthSession): Promise<TotpSetup> {
		return this.security.startTotp(session);
	}

	@Post('totp/confirm')
	@HttpCode(200)
	@AllowDuringEnrollment()
	@RequireReauth({ exceptFirstFactor: true })
	@Throttle(tight)
	confirmTotp(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(mfaTotpSchema)) body: MfaTotpInput,
		@CurrentClient() client: Client
	): Promise<RecoveryCodes> {
		return this.security.confirmTotp(session, body.code, client);
	}

	@Delete('totp')
	@HttpCode(204)
	@RequireReauth()
	@Throttle(tight)
	async removeTotp(@CurrentSession() session: AuthSession, @CurrentClient() client: Client) {
		await this.security.removeTotp(session, client);
	}

	@Post('passkeys/options')
	@HttpCode(200)
	@AllowDuringEnrollment()
	@Throttle(tight)
	passkeyOptions(
		@CurrentSession() session: AuthSession
	): Promise<PublicKeyCredentialCreationOptionsJSON> {
		return this.security.passkeyOptions(session);
	}

	@Post('passkeys')
	@AllowDuringEnrollment()
	@RequireReauth({ exceptFirstFactor: true })
	@Throttle(tight)
	addPasskey(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(createPasskeySchema)) body: CreatePasskeyInput,
		@CurrentClient() client: Client
	): Promise<PasskeyCreated> {
		return this.security.addPasskey(session, body, client);
	}

	@Patch('passkeys/:id')
	@HttpCode(204)
	@Throttle(tight)
	async renamePasskey(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) id: string,
		@Body(new ZodPipe(renamePasskeySchema)) body: RenamePasskeyInput
	) {
		await this.security.renamePasskey(session, id, body.name);
	}

	@Delete('passkeys/:id')
	@HttpCode(204)
	@RequireReauth()
	@Throttle(tight)
	async removePasskey(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) id: string,
		@CurrentClient() client: Client
	) {
		await this.security.removePasskey(session, id, client);
	}

	@Post('recovery-codes')
	@HttpCode(200)
	@RequireReauth()
	@Throttle(tight)
	renewRecoveryCodes(
		@CurrentSession() session: AuthSession,
		@CurrentClient() client: Client
	): Promise<RecoveryCodes> {
		return this.security.renewRecoveryCodes(session, client);
	}
}
