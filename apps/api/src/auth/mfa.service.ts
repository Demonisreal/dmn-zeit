import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
	ApiError,
	AuthenticationResponse,
	MfaChallenge,
	MfaMethod,
	ReauthInput,
	ReauthResult,
	Session
} from '@zeit/shared';
import type { Request, Response } from 'express';
import { Audit } from '../common/audit';
import type { Client } from '../common/client.decorator';
import { Clock } from '../common/clock';
import type { AuthSession } from '../common/session.guard';
import type { Config } from '../config';
import { MailQueue } from '../mail/mail.queue';
import { MailTransport } from '../mail/mail.transport';
import { recoveryCodeUsedMail } from '../mail/templates';
import { AuthService } from './auth.service';
import { AuthStore } from './auth.store';
import { FactorStore, type Scope } from './factor.store';
import { hashRecoveryCode } from './recovery-codes';
import { unseal } from './secrets';
import { SessionService } from './session.service';
import { hashToken, newToken } from './tokens';
import { stepOf } from './totp';
import { WebAuthn, type Assertion } from './webauthn';

function stepExpired() {
	return new UnauthorizedException({
		code: 'UNAUTHENTICATED',
		message: 'The sign-in step expired, start again with email and password',
		details: null
	} satisfies ApiError);
}

const wrongFactor = {
	code: 'INVALID_CREDENTIALS',
	message: 'The code or passkey did not match',
	details: null
} satisfies ApiError;

@Injectable()
export class MfaService {
	private readonly dataKey: Buffer;
	private readonly pepper: Buffer;

	constructor(
		private readonly factors: FactorStore,
		private readonly store: AuthStore,
		private readonly auth: AuthService,
		private readonly sessions: SessionService,
		private readonly webauthn: WebAuthn,
		private readonly mail: MailTransport,
		private readonly queue: MailQueue,
		private readonly audit: Audit,
		private readonly clock: Clock,
		config: ConfigService<Config, true>
	) {
		this.dataKey = config.get('DATA_ENCRYPTION_KEY', { infer: true });
		this.pepper = config.get('PASSWORD_PEPPER', { infer: true });
	}

	async methodsFor(userId: string): Promise<MfaMethod[]> {
		const { hasTotp, passkeyCount, recoveryLeft } = await this.factors.factors(userId);
		const methods: MfaMethod[] = [];
		if (hasTotp) methods.push('totp');
		if (passkeyCount > 0) methods.push('passkey');
		if (methods.length > 0 && recoveryLeft > 0) methods.push('recovery');
		return methods;
	}

	async challenge(response: Response, userId: string, methods: MfaMethod[]): Promise<MfaChallenge> {
		const token = newToken();
		await this.factors.createMfaChallenge(userId, hashToken(token));
		this.sessions.setMfaCookie(response, token);
		return { mfaRequired: true, methods };
	}

	async signIn(
		response: Response,
		userId: string,
		client: Client,
		method: string,
		bypassLock = false
	) {
		const session = await this.sessions.open(response, userId, client, bypassLock);
		await this.audit.record({
			tenantId: session.tenant.id,
			userId,
			employeeId: session.user.employeeId,
			actor: { userId, role: session.user.role },
			action: 'login.succeeded',
			details: { method },
			client
		});
		return session;
	}

	totp(request: Request, response: Response, code: string, client: Client): Promise<Session> {
		return this.secondStep(request, response, client, 'totp', ({ userId }) =>
			this.totpMatches(userId, code)
		);
	}

	async recovery(
		request: Request,
		response: Response,
		code: string,
		client: Client
	): Promise<Session> {
		const session = await this.secondStep(request, response, client, 'recovery', ({ userId }) =>
			this.factors.useRecoveryCode(userId, hashRecoveryCode(code, this.pepper))
		);
		this.queue.later(() =>
			this.mail.send({
				tenantId: session.tenant.id,
				to: session.user.email,
				...recoveryCodeUsedMail(session.user.locale, { name: session.user.displayName })
			})
		);
		return session;
	}

	passkey(
		request: Request,
		response: Response,
		assertion: AuthenticationResponse,
		client: Client
	): Promise<Session> {
		return this.secondStep(request, response, client, 'passkey', async ({ userId }) =>
			this.trusted(await this.webauthn.assert(assertion, 'login', userId), client)
		);
	}

	async passkeyLogin(
		response: Response,
		assertion: AuthenticationResponse,
		client: Client
	): Promise<Session> {
		const found = await this.webauthn.assert(assertion, 'login', null);
		if (!found || !(await this.trusted(found, client))) {
			if (found && !found.verified) await this.loginFailed(found, 'passkey', client);
			throw new UnauthorizedException(wrongFactor);
		}
		return this.signIn(response, found.userId, client, 'passkey', true);
	}

	async reauth(session: AuthSession, input: ReauthInput, client: Client): Promise<ReauthResult> {
		await this.auth.confirmPassword(session, input.password, client);
		if (!(await this.totpMatches(session.userId, input.code))) {
			await this.store.loginFailed(session.userId);
			await this.reauthFailed(session, 'totp', client);
			throw new ForbiddenException(wrongFactor);
		}
		return { reauthUntil: await this.factors.reauth(session.id) };
	}

	async reauthWithPasskey(
		session: AuthSession,
		assertion: AuthenticationResponse,
		client: Client
	): Promise<ReauthResult> {
		const found = await this.webauthn.assert(assertion, 'reauth', session.userId);
		if (!(await this.trusted(found, client))) {
			await this.reauthFailed(session, 'passkey', client);
			throw new ForbiddenException(wrongFactor);
		}
		return { reauthUntil: await this.factors.reauth(session.id) };
	}

	private async secondStep(
		request: Request,
		response: Response,
		client: Client,
		method: MfaMethod,
		matches: (scope: Scope) => Promise<boolean>
	): Promise<Session> {
		const token = this.sessions.mfaToken(request);
		if (!token) throw stepExpired();

		const tokenHash = hashToken(token);
		const scope = await this.factors.attemptMfaChallenge(tokenHash);
		if (!scope) throw stepExpired();

		if (!(await matches(scope))) {
			await this.store.loginFailed(scope.userId);
			await this.loginFailed(scope, method, client);
			throw new UnauthorizedException(wrongFactor);
		}

		if (!(await this.factors.consumeMfaChallenge(tokenHash))) throw stepExpired();
		this.sessions.clearMfaCookie(response);
		return this.signIn(response, scope.userId, client, method);
	}

	private async totpMatches(userId: string, code: string): Promise<boolean> {
		const totp = await this.factors.totp(userId);
		if (!totp?.confirmed) return false;

		const step = stepOf(unseal(totp.sealed, this.dataKey, userId), code, this.clock.now());
		return step !== null && (await this.factors.useTotpStep(userId, step));
	}

	private async trusted(found: Assertion | null, client: Client): Promise<boolean> {
		if (found?.cloned) {
			await this.audit.record({
				tenantId: found.tenantId,
				userId: found.userId,
				actor: null,
				action: 'passkey.counter_rejected',
				details: { passkeyId: found.passkeyId },
				client
			});
		}
		return !!found?.verified && !found.cloned;
	}

	private loginFailed(scope: Scope, method: MfaMethod, client: Client) {
		return this.audit.record({
			tenantId: scope.tenantId,
			userId: scope.userId,
			actor: null,
			action: 'login.failed',
			details: { method },
			client
		});
	}

	private reauthFailed(session: AuthSession, method: MfaMethod, client: Client) {
		return this.audit.record({
			tenantId: session.tenantId,
			userId: session.userId,
			employeeId: session.employeeId,
			actor: { userId: session.userId, role: session.role },
			action: 'reauth.failed',
			details: { method },
			client
		});
	}
}
