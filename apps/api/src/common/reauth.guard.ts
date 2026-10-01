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
	exceptFirstFactor?: boolean;
};

export const RequireReauth = (options: ReauthOptions = {}) => SetMetadata(REAUTH, options);

@Injectable()
export class ReauthGuard implements CanActivate {
	private readonly demo: boolean;

	constructor(
		private readonly reflector: Reflector,
		config: ConfigService<Config, true>
	) {
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
