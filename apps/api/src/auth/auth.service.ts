import {
	BadRequestException,
	ForbiddenException,
	Injectable,
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
import { Audit } from '../common/audit';
import type { Client } from '../common/client.decorator';
import { Clock } from '../common/clock';
import type { AuthSession } from '../common/session.guard';
import type { Config } from '../config';
import type { TenantContext } from '../db/database';
import { MailQueue } from '../mail/mail.queue';
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

type Checked = { credential: Credential & { passwordHash: string }; matched: boolean };

@Injectable()
export class AuthService {
	private readonly origin: string;
	private readonly pepper: Buffer;

	constructor(
		private readonly store: AuthStore,
		private readonly mail: MailTransport,
		private readonly queue: MailQueue,
		private readonly audit: Audit,
		private readonly clock: Clock,
		config: ConfigService<Config, true>
	) {
		this.origin = config.get('APP_ORIGIN', { infer: true });
		this.pepper = config.get('PASSWORD_PEPPER', { infer: true });
	}

	// the password step only, the caller decides between a second factor and a session
	async login(input: LoginInput, client: Client): Promise<string> {
		const checked = await this.check(input.email, input.password);
		if (checked && !checked.matched) {
			await this.audit.record({
				tenantId: checked.credential.tenantId,
				userId: checked.credential.userId,
				actor: null,
				action: 'login.failed',
				details: { method: 'password' },
				client
			});
		}
		if (!checked?.matched) throw new UnauthorizedException(invalidCredentials);

		const { userId, passwordHash } = checked.credential;
		if (needsRehash(passwordHash)) {
			await this.store.rehash(
				userId,
				passwordHash,
				await hashPassword(input.password, this.pepper)
			);
		}
		return userId;
	}

	// password change and step-up both want the current password, counted like a login
	async confirmPassword(session: AuthSession, password: string, client: Client): Promise<Profile> {
		const profile = await this.store.profile(session);
		const checked = await this.check(profile.user.email, password);
		if (checked?.matched) return profile;

		if (checked) {
			await this.audit.record({
				tenantId: session.tenantId,
				userId: session.userId,
				employeeId: session.employeeId,
				actor: { userId: session.userId, role: session.role },
				action: 'reauth.failed',
				details: { method: 'password' },
				client
			});
		}
		throw new ForbiddenException(invalidCredentials);
	}

	// the caller opens the new session, all others are gone after this
	async changePassword(
		session: AuthSession,
		input: ChangePasswordInput,
		client: Client
	): Promise<void> {
		if (isCommonPassword(input.newPassword)) throw commonPassword('newPassword');

		const profile = await this.confirmPassword(session, input.currentPassword, client);
		await this.store.changePassword(session, await hashPassword(input.newPassword, this.pepper));
		this.queue.later(() => this.mailPasswordChanged(profile));
	}

	forgotPassword(email: string, requestId: string): void {
		// after the answer, its timing must not tell whether the address has an account
		this.queue.later(() => this.sendReset(email, requestId));
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

		this.queue.later(async () => {
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

	// the new account, the caller opens its first session to set up the second factor
	async acceptInvitation(input: AcceptInvitationInput, requestId: string): Promise<string> {
		if (isCommonPassword(input.password)) throw commonPassword('password');

		const tokenHash = hashToken(input.token);
		// cheap check first, hashing for every guessed token would hand out free cpu time
		if (!(await this.store.inspectToken(tokenHash, 'invite'))) throw tokenInvalid();

		const passwordHash = await hashPassword(input.password, this.pepper);
		const userId = await this.store.acceptInvitation(requestId, tokenHash, passwordHash);
		if (!userId) throw tokenInvalid();
		return userId;
	}

	// undefined for unknown, locked and password-less alike; only a wrong guess counts towards the lock
	private async check(email: string, password: string): Promise<Checked | undefined> {
		const credential = await this.store.credential(email);
		const locked =
			!!credential?.lockedUntil && Date.parse(credential.lockedUntil) > this.clock.now().getTime();
		if (!credential?.passwordHash || locked) {
			await dummyVerify(password, this.pepper);
			return undefined;
		}

		const known = { ...credential, passwordHash: credential.passwordHash };
		if (await verifyPassword(credential.passwordHash, password, this.pepper)) {
			return { credential: known, matched: true };
		}
		await this.store.loginFailed(credential.userId);
		return { credential: known, matched: false };
	}

	private async mailPasswordChanged({ user, tenant }: Profile): Promise<void> {
		await this.mail.send({
			tenantId: tenant.id,
			to: user.email,
			...passwordChangedMail(user.locale, { name: user.displayName })
		});
	}
}
