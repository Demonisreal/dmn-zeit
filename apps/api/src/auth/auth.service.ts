import {
	BadRequestException,
	BeforeApplicationShutdown,
	ForbiddenException,
	Injectable,
	Logger,
	UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
	AcceptInvitationInput,
	ApiError,
	ChangePasswordInput,
	Invitation,
	LoginInput,
	ResetPasswordInput
} from '@zeit/shared';
import { Clock } from '../common/clock';
import type { AuthSession } from '../common/session.guard';
import type { Config } from '../config';
import type { TenantContext } from '../db/database';
import { MailTransport } from '../mail/mail.transport';
import { passwordChangedMail, resetMail } from '../mail/templates';
import { AuthStore, type Credential, type Profile } from './auth.store';
import {
	dummyVerify,
	hashPassword,
	isCommonPassword,
	needsRehash,
	verifyPassword
} from './passwords';
import { hashToken, newToken } from './tokens';

// one message for all cases, it must not tell an unknown address from a locked account
const invalidCredentials = {
	code: 'INVALID_CREDENTIALS',
	message: 'Email or password is wrong. After repeated failures sign-in pauses for a few minutes',
	details: null
} satisfies ApiError;

function tokenInvalid() {
	return new BadRequestException({
		code: 'TOKEN_INVALID',
		message: 'The link is invalid, expired or already used',
		details: null
	} satisfies ApiError);
}

function commonPassword(field: string) {
	return new BadRequestException({
		code: 'VALIDATION',
		message: 'Invalid input',
		details: [{ field, code: 'custom', message: 'password.common' }]
	} satisfies ApiError);
}

function contextOf(credential: Credential, requestId: string): TenantContext & { userId: string } {
	return {
		tenantId: credential.tenantId,
		userId: credential.userId,
		role: credential.role,
		employeeId: null,
		requestId
	};
}

@Injectable()
export class AuthService implements BeforeApplicationShutdown {
	private readonly logger = new Logger(AuthService.name);
	private readonly origin: string;
	private readonly pepper: Buffer;
	// mails that go out after the answer
	private readonly pending = new Set<Promise<void>>();

	constructor(
		private readonly store: AuthStore,
		private readonly mail: MailTransport,
		private readonly clock: Clock,
		config: ConfigService<Config, true>
	) {
		this.origin = config.get('APP_ORIGIN', { infer: true });
		this.pepper = config.get('PASSWORD_PEPPER', { infer: true });
	}

	async login(input: LoginInput, requestId: string): Promise<string> {
		const credential = await this.check(input.email, input.password);
		if (!credential) throw new UnauthorizedException(invalidCredentials);

		if (needsRehash(credential.passwordHash)) {
			// password_change also ends the other sessions, fine for the rare raise of the parameters
			const rehashed = await hashPassword(input.password, this.pepper);
			await this.store.changePassword(contextOf(credential, requestId), rehashed);
		}
		return credential.userId;
	}

	// the caller opens the new session, all others are gone after this
	async changePassword(session: AuthSession, input: ChangePasswordInput): Promise<void> {
		if (isCommonPassword(input.newPassword)) throw commonPassword('newPassword');

		const profile = await this.store.profile(session);
		if (!(await this.check(profile.user.email, input.currentPassword))) {
			throw new ForbiddenException(invalidCredentials);
		}

		await this.store.changePassword(session, await hashPassword(input.newPassword, this.pepper));
		this.later(() => this.mailPasswordChanged(profile));
	}

	forgotPassword(email: string, requestId: string): void {
		// after the answer, its timing must not tell whether the address has an account
		this.later(() => this.sendReset(email, requestId));
	}

	async sendReset(email: string, requestId: string): Promise<void> {
		const credential = await this.store.credential(email);
		if (!credential?.passwordHash) return;

		const token = newToken();
		await this.store.issueToken(credential.userId, 'password_reset', hashToken(token));

		const { user, tenant } = await this.store.profile(contextOf(credential, requestId));
		await this.mail.send({
			tenantId: tenant.id,
			to: user.email,
			...resetMail(user.locale, { name: user.displayName, link: `${this.origin}/reset#t=${token}` })
		});
	}

	async resetPassword(input: ResetPasswordInput, requestId: string): Promise<void> {
		if (isCommonPassword(input.password)) throw commonPassword('password');

		const tokenHash = hashToken(input.token);
		const owner = await this.store.inspectToken(tokenHash, 'password_reset');
		if (!owner) throw tokenInvalid();

		const passwordHash = await hashPassword(input.password, this.pepper);
		const userId = await this.store.resetPassword(tokenHash, passwordHash);
		if (!userId) throw tokenInvalid();

		this.later(async () => {
			const credential = await this.store.credential(owner.email);
			if (credential) {
				await this.mailPasswordChanged(await this.store.profile(contextOf(credential, requestId)));
			}
		});
	}

	async inspectInvitation(token: string): Promise<Invitation> {
		const owner = await this.store.inspectToken(hashToken(token), 'invite');
		if (!owner) throw tokenInvalid();
		return { email: owner.email, displayName: owner.displayName, tenantName: owner.tenantName };
	}

	async acceptInvitation(input: AcceptInvitationInput, requestId: string): Promise<void> {
		if (isCommonPassword(input.password)) throw commonPassword('password');

		const tokenHash = hashToken(input.token);
		// cheap check first, hashing for every guessed token would hand out free cpu time
		if (!(await this.store.inspectToken(tokenHash, 'invite'))) throw tokenInvalid();

		const passwordHash = await hashPassword(input.password, this.pepper);
		if (!(await this.store.acceptInvitation(requestId, tokenHash, passwordHash))) {
			throw tokenInvalid();
		}
	}

	// null for unknown, locked, password-less and wrong alike; only a wrong guess counts towards the lock
	private async check(
		email: string,
		password: string
	): Promise<(Credential & { passwordHash: string }) | null> {
		const credential = await this.store.credential(email);
		const locked =
			!!credential?.lockedUntil && Date.parse(credential.lockedUntil) > this.clock.now().getTime();
		if (!credential?.passwordHash || locked) {
			await dummyVerify(password, this.pepper);
			return null;
		}

		if (await verifyPassword(credential.passwordHash, password, this.pepper)) {
			return { ...credential, passwordHash: credential.passwordHash };
		}
		await this.store.loginFailed(credential.userId);
		return null;
	}

	private async mailPasswordChanged({ user, tenant }: Profile): Promise<void> {
		await this.mail.send({
			tenantId: tenant.id,
			to: user.email,
			...passwordChangedMail(user.locale, { name: user.displayName })
		});
	}

	private later(work: () => Promise<void>) {
		const job: Promise<void> = new Promise((resolve) => setImmediate(resolve))
			.then(work)
			.catch((error: unknown) => this.logger.error(error))
			.finally(() => this.pending.delete(job));
		this.pending.add(job);
	}

	// a job that reaches for a connection while the pool closes would hold up the shutdown for good
	async beforeApplicationShutdown() {
		await Promise.allSettled(this.pending);
	}
}
