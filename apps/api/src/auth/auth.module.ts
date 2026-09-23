import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthStore } from './auth.store';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
	imports: [MailModule],
	controllers: [AuthController, SessionController],
	providers: [AuthStore, AuthService, SessionService],
	// the global SessionGuard resolves the cookie through it
	exports: [SessionService]
})
export class AuthModule {}
