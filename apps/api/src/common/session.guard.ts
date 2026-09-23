import {
	CanActivate,
	ExecutionContext,
	Injectable,
	SetMetadata,
	UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { SessionRow } from '../auth/auth.store';
import { SessionService } from '../auth/session.service';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

// fits TenantContext, so services hand it straight to withTenant
export type AuthSession = SessionRow & { requestId: string };

declare module 'express' {
	interface Request {
		auth?: AuthSession;
	}
}

export function isPublic(reflector: Reflector, context: ExecutionContext): boolean {
	return !!reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
		context.getHandler(),
		context.getClass()
	]);
}

@Injectable()
export class SessionGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly sessions: SessionService
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		if (isPublic(this.reflector, context)) return true;

		const request = context.switchToHttp().getRequest<Request>();
		const session = await this.sessions.resolve(request);
		if (!session) throw new UnauthorizedException('Not signed in');

		request.auth = session;
		return true;
	}
}
