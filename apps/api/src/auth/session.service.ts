import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ActiveSession, Session } from '@zeit/shared';
import type { CookieOptions, Request, Response } from 'express';
import type { Client } from '../common/client.decorator';
import type { AuthSession } from '../common/session.guard';
import type { Config } from '../config';
import { AuthStore } from './auth.store';
import { csrfTokenFor, hashToken, newToken } from './tokens';

@Injectable()
export class SessionService {
	readonly cookieName: string;
	private readonly cookie: CookieOptions;

	constructor(
		private readonly store: AuthStore,
		config: ConfigService<Config, true>
	) {
		// __Host- requires Secure and Secure requires https, so plain http://localhost gets the bare name
		const secure = new URL(config.get('APP_ORIGIN', { infer: true })).protocol === 'https:';
		this.cookieName = secure ? '__Host-zeit_sid' : 'zeit_sid';
		this.cookie = { httpOnly: true, secure, sameSite: 'strict', path: '/' };
	}

	async open(response: Response, userId: string, client: Client): Promise<Session> {
		const token = newToken();
		await this.store.createSession(userId, {
			tokenHash: hashToken(token),
			csrfHash: hashToken(csrfTokenFor(token)),
			ip: client.ip,
			userAgent: client.userAgent
		});
		response.cookie(this.cookieName, token, this.cookie);

		const session = await this.store.resolveSession(hashToken(token));
		return this.describe({ ...session!, requestId: client.requestId }, token);
	}

	async resolve(request: Request): Promise<AuthSession | undefined> {
		const token: unknown = request.cookies?.[this.cookieName];
		if (typeof token !== 'string') return undefined;

		const session = await this.store.resolveSession(hashToken(token));
		return session && { ...session, requestId: String(request.id) };
	}

	current(session: AuthSession, request: Request): Promise<Session> {
		return this.describe(session, request.cookies[this.cookieName] as string);
	}

	async list(session: AuthSession): Promise<ActiveSession[]> {
		const sessions = await this.store.sessions(session.userId);
		return sessions.map((active) => ({ ...active, current: active.id === session.id }));
	}

	async revoke(session: AuthSession, sessionId: string, response: Response): Promise<boolean> {
		const revoked = await this.store.revokeSession(session.userId, sessionId);
		if (revoked && sessionId === session.id) this.clear(response);
		return revoked;
	}

	clear(response: Response) {
		response.clearCookie(this.cookieName, this.cookie);
	}

	private async describe(session: AuthSession, token: string): Promise<Session> {
		const profile = await this.store.profile(session);
		return { ...profile, csrfToken: csrfTokenFor(token) };
	}
}
