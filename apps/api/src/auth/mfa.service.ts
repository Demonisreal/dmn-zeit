import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
import { AuthService } from './auth.service';
import { AuthStore } from './auth.store';
import { FactorStore } from './factor.store';
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
	private readonly logger = new Logger(MfaService.name);
	private readonly dataKey: Buffer;

	constructor(
		private readonly factors: FactorStore,
		private readonly store: AuthStore,
		private readonly auth: AuthService,
		private readonly sessions: SessionService,
		private readonly webauthn: WebAuthn,
		private readonly audit: Audit,
		private readonly clock: Clock,
		config: ConfigService<Config, true>
	) {
		this.dataKey = config.get('DATA_ENCRYPTION_KEY', { infer: true });
	}

	// empty for someone without any second factor, their session then only reaches the setup
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

	async signIn(response: Response, userId: string, client: Client, method: string) {
		const session = await this.sessions.open(response, userId, client);
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
		return this.secondStep(request, response, client, 'totp', (userId) =>
			this.totpMatches(userId, code)
		);
	}

	recovery(request: Request, response: Response, code: string, client: Client): Promise<Session> {
		return this.secondStep(request, response, client, 'recovery', (userId) =>
			this.factors.useRecoveryCode(userId, hashRecoveryCode(code))
		);
	}

	passkey(
		request: Request,
		response: Response,
		assertion: AuthenticationResponse,
		client: Client
	): Promise<Session> {
		return this.secondStep(request, response, client, 'passkey', async (userId) =>
			this.trusted(await this.webauthn.assert(assertion, 'login', userId), client)
		);
	}

	// a passkey with user verification counts as both factors, no password needed
	async passkeyLogin(
		response: Response,
		assertion: AuthenticationResponse,
		client: Client
	): Promise<Session> {
		const verified = await this.webauthn.assert(assertion, 'login', null);
		if (!verified || !this.trusted(verified, client)) {
			throw new UnauthorizedException(wrongFactor);
		}
		return this.signIn(response, verified.userId, client, 'passkey');
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
		const verified = await this.webauthn.assert(assertion, 'reauth', session.userId);
		if (!verified || !this.trusted(verified, client)) {
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
		matches: (userId: string) => Promise<boolean>
	): Promise<Session> {
		const token = this.sessions.mfaToken(request);
		if (!token) throw stepExpired();

		const tokenHash = hashToken(token);
		const userId = await this.factors.attemptMfaChallenge(tokenHash);
		if (!userId) throw stepExpired();

		if (!(await matches(userId))) {
			// the password was right already, a wrong second factor counts towards the lock all the same
			await this.store.loginFailed(userId);
			this.logger.warn(`Second factor ${method} failed for user ${userId} from ${client.ip}`);
			throw new UnauthorizedException(wrongFactor);
		}

		if (!(await this.factors.consumeMfaChallenge(tokenHash))) throw stepExpired();
		this.sessions.clearMfaCookie(response);
		return this.signIn(response, userId, client, method);
	}

	private async totpMatches(userId: string, code: string): Promise<boolean> {
		const totp = await this.factors.totp(userId);
		if (!totp?.confirmed) return false;

		const step = stepOf(unseal(totp.sealed, this.dataKey, userId), code, this.clock.now());
		return step !== null && (await this.factors.useTotpStep(userId, step));
	}

	private trusted(verified: Assertion | null, client: Client): boolean {
		if (verified?.cloned) {
			this.logger.warn(
				`Passkey ${verified.passkeyId} of user ${verified.userId} replayed an old counter from ${client.ip}`
			);
		}
		return !!verified && !verified.cloned;
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
