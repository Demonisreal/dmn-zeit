import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { ApiError } from '@zeit/shared';
import type { Request } from 'express';
import { csrfMatches } from '../auth/tokens';
import type { Config } from '../config';
import { isPublic } from './session.guard';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function refused(message: string) {
	return new ForbiddenException({ code: 'CSRF', message, details: null } satisfies ApiError);
}

@Injectable()
export class CsrfGuard implements CanActivate {
	private readonly origin: string;

	constructor(
		private readonly reflector: Reflector,
		config: ConfigService<Config, true>
	) {
		this.origin = config.get('APP_ORIGIN', { infer: true });
	}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>();
		if (SAFE_METHODS.has(request.method)) return true;

		if (!request.is('application/json')) {
			throw refused('Writes have to be sent as application/json');
		}

		const site = request.headers['sec-fetch-site'];
		const sameOrigin = site ? site === 'same-origin' : request.headers.origin === this.origin;
		if (!sameOrigin) throw refused('Cross-origin write refused');

		if (isPublic(this.reflector, context)) return true;

		if (!csrfMatches(request.header('x-csrf-token'), request.auth!.csrfHash)) {
			throw refused('CSRF token missing or wrong');
		}
		return true;
	}
}
