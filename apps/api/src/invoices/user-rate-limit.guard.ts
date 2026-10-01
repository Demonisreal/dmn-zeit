import {
	CanActivate,
	ExecutionContext,
	HttpException,
	HttpStatus,
	Injectable,
	SetMetadata
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiError } from '@zeit/shared';
import type { Request, Response } from 'express';
import { sql } from 'kysely';
import { Database } from '../db/database';

const LIMIT = 'userRateLimit';

// bedrohungsmodell-rechnungen.md Abschnitt 10: the throttler guard runs before the session guard
// and only ever sees an ip, so a per-user limit on drafts/issue/cancel needs its own guard here
export const UserRateLimit = (name: string, limit: number, windowMinutes = 1) =>
	SetMetadata(LIMIT, { name, limit, windowMinutes });

@Injectable()
export class UserRateLimitGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly db: Database
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const options = this.reflector.get<{ name: string; limit: number; windowMinutes: number } | undefined>(
			LIMIT,
			context.getHandler()
		);
		if (!options) return true;

		const request = context.switchToHttp().getRequest<Request>();
		const userId = request.auth?.userId;
		if (!userId) return true;

		const key = `invoices:${options.name}:${userId}`;
		const { rows } = await sql<{ hits: number; retryAfter: number }>`
			insert into ops.rate_limits as r (key, hits, expires_at)
			values (${key}, 1, now() + make_interval(mins => ${options.windowMinutes}))
			on conflict (key) do update
				set hits = case when r.expires_at > now() then r.hits + 1 else 1 end,
					expires_at = case when r.expires_at > now() then r.expires_at else excluded.expires_at end
			returning r.hits, ceil(extract(epoch from r.expires_at - now()))::int as "retryAfter"`.execute(
			this.db
		);
		const hit = rows[0]!;
		if (hit.hits <= options.limit) return true;

		context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(hit.retryAfter));
		throw new HttpException(
			{
				code: 'RATE_LIMITED',
				message: 'Too many requests, try again later',
				details: { retryAfter: hit.retryAfter }
			} satisfies ApiError,
			HttpStatus.TOO_MANY_REQUESTS
		);
	}
}
