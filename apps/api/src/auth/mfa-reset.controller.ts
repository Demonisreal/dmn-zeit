import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { minutes, Throttle } from '@nestjs/throttler';
import { uuidSchema } from '@zeit/shared';
import { CurrentClient, type Client } from '../common/client.decorator';
import { CurrentSession } from '../common/current-session.decorator';
import { RequireReauth } from '../common/reauth.guard';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { SecurityService } from './security.service';

@Controller('users')
export class MfaResetController {
	constructor(private readonly security: SecurityService) {}

	@Post(':id/mfa/reset')
	@HttpCode(204)
	@Roles('admin')
	@RequireReauth()
	@Throttle({ default: { limit: 10, ttl: minutes(1) } })
	async reset(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) userId: string,
		@CurrentClient() client: Client
	) {
		await this.security.resetFactors(session, userId, client);
	}
}
