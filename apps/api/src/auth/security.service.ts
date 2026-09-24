import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/server';
import type {
	ApiError,
	CreatePasskeyInput,
	Locale,
	PasskeyCreated,
	RecoveryCodes,
	SecurityOverview,
	TotpSetup
} from '@zeit/shared';
import { Audit } from '../common/audit';
import type { Client } from '../common/client.decorator';
import { Clock } from '../common/clock';
import type { AuthSession } from '../common/session.guard';
import type { Config } from '../config';
import { MailQueue } from '../mail/mail.queue';
import { MailTransport } from '../mail/mail.transport';
import {
	mfaResetMail,
	passkeyAddedMail,
	passkeyRemovedMail,
	recoveryCodesRenewedMail,
	totpEnabledMail,
	totpRemovedMail
} from '../mail/templates';
import { AuthStore } from './auth.store';
import { FactorStore, type Factors } from './factor.store';
import { newRecoveryCodes } from './recovery-codes';
import { KEY_VERSION, seal, unseal } from './secrets';
import { newTotpSecret, stepOf, totpSetup } from './totp';
import { WebAuthn } from './webauthn';

type Notice = (locale: Locale, params: { name: string }) => { subject: string; text: string };

@Injectable()
export class SecurityService {
	private readonly dataKey: Buffer;
	private readonly demo: boolean;

	constructor(
		private readonly factors: FactorStore,
		private readonly store: AuthStore,
		private readonly webauthn: WebAuthn,
		private readonly mail: MailTransport,
		private readonly queue: MailQueue,
		private readonly audit: Audit,
		private readonly clock: Clock,
		config: ConfigService<Config, true>
	) {
		this.dataKey = config.get('DATA_ENCRYPTION_KEY', { infer: true });
		this.demo = config.get('APP_MODE', { infer: true }) === 'demo';
	}

	async overview(session: AuthSession): Promise<SecurityOverview> {
		const [{ hasTotp, recoveryLeft }, passkeys] = await Promise.all([
			this.factors.factors(session.userId),
			this.factors.passkeys(session.userId)
		]);
		return {
			hasTotp,
			passkeys: passkeys.map(({ id, name, createdAt, lastUsedAt, backedUp }) => ({
				id,
				name,
				createdAt,
				lastUsedAt,
				backedUp
			})),
			recoveryCodesLeft: recoveryLeft,
			reauthUntil: session.reauthUntil
		};
	}

	// a pending secret replaces the previous pending one, a confirmed one has to be removed first
	async startTotp(session: AuthSession): Promise<TotpSetup> {
		const { user } = await this.store.profile(session);
		const secret = newTotpSecret();
		const begun = await this.factors.beginTotp(
			session.userId,
			seal(secret, this.dataKey, session.userId),
			KEY_VERSION
		);
		if (!begun) {
			throw new ConflictException({
				code: 'INVALID_STATE',
				message: 'An authenticator app is already set up',
				details: null
			} satisfies ApiError);
		}
		return totpSetup(secret, user.email);
	}

	async confirmTotp(session: AuthSession, code: string, client: Client): Promise<RecoveryCodes> {
		const totp = await this.factors.totp(session.userId);
		const step =
			totp && !totp.confirmed
				? stepOf(unseal(totp.sealed, this.dataKey, session.userId), code, this.clock.now())
				: null;
		if (step === null) {
			throw new BadRequestException({
				code: 'VALIDATION',
				message: 'Invalid input',
				details: [{ field: 'code', code: 'custom', message: 'format.totp' }]
			} satisfies ApiError);
		}

		const codes = (await this.isFirstFactor(session.userId)) ? newRecoveryCodes() : undefined;
		if (!(await this.factors.confirmTotp(session.userId, step, codes?.hashes ?? null))) {
			throw new ConflictException({
				code: 'INVALID_STATE',
				message: 'There is no authenticator app waiting for confirmation',
				details: null
			} satisfies ApiError);
		}

		await this.afterChange(session, 'totp.enabled', client, totpEnabledMail);
		return { recoveryCodes: codes?.codes ?? [] };
	}

	async removeTotp(session: AuthSession, client: Client): Promise<void> {
		const factors = await this.factors.factors(session.userId);
		if (!factors.hasTotp) throw new NotFoundException('No authenticator app is set up');

		this.keepOneFactor(factors);
		await this.factors.removeTotp(session.userId);
		await this.afterChange(session, 'totp.removed', client, totpRemovedMail);
	}

	async passkeyOptions(session: AuthSession): Promise<PublicKeyCredentialCreationOptionsJSON> {
		const { user } = await this.store.profile(session);
		return this.webauthn.creationOptions(user);
	}

	async addPasskey(
		session: AuthSession,
		input: CreatePasskeyInput,
		client: Client
	): Promise<PasskeyCreated> {
		const passkey = await this.webauthn.register(session.userId, input.response, input.name);
		const first = await this.isFirstFactor(session.userId);
		const id = await this.factors.addPasskey(session.userId, passkey);

		const codes = first ? newRecoveryCodes() : undefined;
		if (codes) await this.factors.replaceRecoveryCodes(session.userId, codes.hashes);

		await this.afterChange(session, 'passkey.added', client, (locale, { name }) =>
			passkeyAddedMail(locale, { name, passkey: input.name })
		);
		const saved = (await this.factors.passkeys(session.userId)).find((row) => row.id === id)!;
		return {
			passkey: {
				id,
				name: saved.name,
				createdAt: saved.createdAt,
				lastUsedAt: saved.lastUsedAt,
				backedUp: saved.backedUp
			},
			recoveryCodes: codes?.codes ?? []
		};
	}

	async renamePasskey(session: AuthSession, passkeyId: string, name: string): Promise<void> {
		if (!(await this.factors.renamePasskey(session.userId, passkeyId, name))) {
			throw new NotFoundException('Passkey not found');
		}
	}

	async removePasskey(session: AuthSession, passkeyId: string, client: Client): Promise<void> {
		const passkey = (await this.factors.passkeys(session.userId)).find(
			(row) => row.id === passkeyId
		);
		if (!passkey) throw new NotFoundException('Passkey not found');

		this.keepOneFactor(await this.factors.factors(session.userId));
		await this.factors.removePasskey(session.userId, passkeyId);
		await this.afterChange(session, 'passkey.removed', client, (locale, { name }) =>
			passkeyRemovedMail(locale, { name, passkey: passkey.name })
		);
	}

	async renewRecoveryCodes(session: AuthSession, client: Client): Promise<RecoveryCodes> {
		if (await this.isFirstFactor(session.userId)) {
			throw new ConflictException({
				code: 'INVALID_STATE',
				message: 'Recovery codes need a second factor to go with',
				details: null
			} satisfies ApiError);
		}
		const { codes, hashes } = newRecoveryCodes();
		await this.factors.replaceRecoveryCodes(session.userId, hashes);
		await this.afterChange(session, 'recovery_codes.renewed', client, recoveryCodesRenewedMail);
		return { recoveryCodes: codes };
	}

	// admins only, never their own account and only within the tenant; the database checks all three
	async resetFactors(admin: AuthSession, userId: string, client: Client): Promise<void> {
		const person = await this.store.person(admin, userId);
		if (!person) throw new NotFoundException('User not found');

		await this.factors.resetFactors(admin, userId);
		await this.audit.record({
			tenantId: admin.tenantId,
			userId,
			employeeId: person.employeeId,
			actor: { userId: admin.userId, role: admin.role },
			action: 'mfa.reset',
			client
		});
		this.queue.later(() =>
			this.mail.send({
				tenantId: admin.tenantId,
				to: person.email,
				...mfaResetMail(person.locale, { name: person.displayName })
			})
		);
	}

	private async isFirstFactor(userId: string): Promise<boolean> {
		const { hasTotp, passkeyCount } = await this.factors.factors(userId);
		return !hasTotp && passkeyCount === 0;
	}

	// outside the demo nobody may end up without a second factor, the next login would stop at the setup
	private keepOneFactor({ hasTotp, passkeyCount }: Factors) {
		if (!this.demo && (hasTotp ? 1 : 0) + passkeyCount <= 1) {
			throw new ConflictException({
				code: 'INVALID_STATE',
				message: 'Set up another second factor before removing the last one',
				details: null
			} satisfies ApiError);
		}
	}

	private async afterChange(session: AuthSession, action: string, client: Client, notice: Notice) {
		// the first factor ends the setup state, any other half-finished session goes with it
		if (session.enrollmentPending) await this.factors.finishEnrollment(session.id);

		await this.audit.record({
			tenantId: session.tenantId,
			userId: session.userId,
			employeeId: session.employeeId,
			actor: { userId: session.userId, role: session.role },
			action,
			client
		});

		const { user, tenant } = await this.store.profile(session);
		this.queue.later(() =>
			this.mail.send({
				tenantId: tenant.id,
				to: user.email,
				...notice(user.locale, { name: user.displayName })
			})
		);
	}
}
