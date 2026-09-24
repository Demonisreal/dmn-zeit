import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ActiveSession, AppMode, Session } from '@zeit/shared';
import type { CookieOptions, Request, Response } from 'express';
import type { Client } from '../common/client.decorator';
import type { AuthSession } from '../common/session.guard';
import type { Config } from '../config';
import { AuthStore } from './auth.store';
import { csrfTokenFor, hashToken, newToken } from './tokens';

@Injectable()
export class SessionService {
	readonly cookieName: string;
	readonly mfaCookieName: string;
	private readonly cookie: CookieOptions;
	private readonly mode: AppMode;

	constructor(
		private readonly store: AuthStore,
		config: ConfigService<Config, true>
	) {
		// __Host- requires Secure and Secure requires https, so plain http://localhost gets the bare name
		const secure = new URL(config.get('APP_ORIGIN', { infer: true })).protocol === 'https:';
		this.cookieName = secure ? '__Host-zeit_sid' : 'zeit_sid';
		this.mfaCookieName = secure ? '__Host-zeit_mfa' : 'zeit_mfa';
		this.cookie = { httpOnly: true, secure, sameSite: 'strict', path: '/' };
		this.mode = config.get('APP_MODE', { infer: true });
	}

	// the pending second step of a password login, as long as the challenge in the database lives
	setMfaCookie(response: Response, token: string) {
		response.cookie(this.mfaCookieName, token, { ...this.cookie, maxAge: 5 * 60_000 });
	}

	mfaToken(request: Request): string | undefined {
		const token: unknown = request.cookies?.[this.mfaCookieName];
		return typeof token === 'string' ? token : undefined;
	}

	clearMfaCookie(response: Response) {
		response.clearCookie(this.mfaCookieName, this.cookie);
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
		return {
			...profile,
			mode: this.mode,
			security: { enrollmentPending: session.enrollmentPending, reauthUntil: session.reauthUntil },
			csrfToken: csrfTokenFor(token)
		};
	}
}
