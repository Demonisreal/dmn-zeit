import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	SetMetadata
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { ApiError } from '@zeit/shared';
import type { Request } from 'express';
import type { Config } from '../config';

export const REAUTH = 'reauth';

type ReauthOptions = {
	// the very first factor is set up with the password alone, there is nothing to confirm with yet
	exceptFirstFactor?: boolean;
};

// the route wants a confirmation with password and second factor from the last ten minutes
export const RequireReauth = (options: ReauthOptions = {}) => SetMetadata(REAUTH, options);

@Injectable()
export class ReauthGuard implements CanActivate {
	private readonly demo: boolean;

	constructor(
		private readonly reflector: Reflector,
		config: ConfigService<Config, true>
	) {
		// sandbox personas have no password, a step-up would lock them out of their own security page
		this.demo = config.get('APP_MODE', { infer: true }) === 'demo';
	}

	canActivate(context: ExecutionContext): boolean {
		const options = this.reflector.getAllAndOverride<ReauthOptions | undefined>(REAUTH, [
			context.getHandler(),
			context.getClass()
		]);
		if (!options || this.demo) return true;

		const session = context.switchToHttp().getRequest<Request>().auth;
		if (session?.reauthUntil) return true;
		if (options.exceptFirstFactor && session?.enrollmentPending) return true;

		throw new ForbiddenException({
			code: 'REAUTH_REQUIRED',
			message: 'Confirm with your password and second factor first',
			details: null
		} satisfies ApiError);
	}
}
