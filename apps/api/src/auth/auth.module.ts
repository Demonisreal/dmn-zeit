import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthStore } from './auth.store';
import { FactorStore } from './factor.store';
import { MfaResetController } from './mfa-reset.controller';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { ReauthController } from './reauth.controller';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { WebAuthn } from './webauthn';

@Module({
	imports: [MailModule],
	controllers: [
		AuthController,
		SessionController,
		MfaController,
		ReauthController,
		SecurityController,
		MfaResetController
	],
	providers: [
		AuthStore,
		FactorStore,
		AuthService,
		SessionService,
		MfaService,
		SecurityService,
		WebAuthn
	],
	exports: [SessionService]
})
export class AuthModule {}
