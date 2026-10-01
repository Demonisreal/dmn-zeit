import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Clock } from './clock';

const WINDOW = 60_000;
const LIMIT = 30;

@Injectable()
export class SessionThrottleGuard implements CanActivate {
	private readonly windows = new Map<string, { hits: number; until: number }>();

	constructor(private readonly clock: Clock) {}

	canActivate(context: ExecutionContext): boolean {
		const http = context.switchToHttp();
		const sessionId = http.getRequest<Request>().auth!.id;
		const now = this.clock.now().getTime();

		let window = this.windows.get(sessionId);
		if (!window || window.until <= now) {
			for (const [id, old] of this.windows) if (old.until <= now) this.windows.delete(id);
			window = { hits: 0, until: now + WINDOW };
			this.windows.set(sessionId, window);
		}
		if (++window.hits <= LIMIT) return true;

		const wait = Math.ceil((window.until - now) / 1000);
		http.getResponse<Response>().header('Retry-After', String(wait));
		throw new ThrottlerException('Too many requests, try again later');
	}
}
