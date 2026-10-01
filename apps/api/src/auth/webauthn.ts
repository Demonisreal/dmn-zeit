import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON
} from '@simplewebauthn/server';
import type { ApiError, AuthenticationResponse, RegistrationResponse } from '@zeit/shared';
import type { Config } from '../config';
import { FactorStore, type NewPasskey, type PasskeyRow, type Scope } from './factor.store';

export type Assertion = Scope & {
	passkeyId: string;
	verified: boolean;
	cloned: boolean;
};

const uuidBytes = (userId: string) => Buffer.from(userId.replaceAll('-', ''), 'hex');

@Injectable()
export class WebAuthn {
	private readonly logger = new Logger(WebAuthn.name);
	private readonly origin: string;
	private readonly rpID: string;

	constructor(
		private readonly factors: FactorStore,
		config: ConfigService<Config, true>
	) {
		this.origin = config.get('APP_ORIGIN', { infer: true });
		this.rpID = new URL(this.origin).hostname;
	}

	async creationOptions(
		user: { id: string; email: string; displayName: string },
		existing: PasskeyRow[]
	): Promise<PublicKeyCredentialCreationOptionsJSON> {
		const options = await generateRegistrationOptions({
			rpName: 'DMN Zeit',
			rpID: this.rpID,
			userName: user.email,
			userID: new Uint8Array(uuidBytes(user.id)),
			userDisplayName: user.displayName,
			attestationType: 'none',
			authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
			excludeCredentials: existing.map(({ credentialId, transports }) => ({
				id: credentialId.toString('base64url'),
				transports
			}))
		});
		await this.factors.createChallenge(
			Buffer.from(options.challenge, 'base64url'),
			'register',
			user.id
		);
		return options;
	}

	async register(
		userId: string,
		response: RegistrationResponse,
		name: string
	): Promise<NewPasskey> {
		const refused = new BadRequestException({
			code: 'VALIDATION',
			message: 'The passkey could not be verified',
			details: []
		} satisfies ApiError);

		const verification = await verifyRegistrationResponse({
			response: response as unknown as RegistrationResponseJSON,
			expectedChallenge: (challenge) =>
				this.factors.consumeChallenge(Buffer.from(challenge, 'base64url'), 'register', userId),
			expectedOrigin: this.origin,
			expectedRPID: this.rpID,
			requireUserVerification: true
		}).catch((error: unknown) => {
			this.logger.warn(`Passkey registration refused: ${String(error)}`);
			throw refused;
		});
		if (!verification.verified) throw refused;

		const { credential, aaguid, credentialBackedUp } = verification.registrationInfo;
		return {
			credentialId: Buffer.from(credential.id, 'base64url'),
			publicKey: Buffer.from(credential.publicKey),
			counter: credential.counter,
			transports: credential.transports ?? [],
			aaguid,
			backedUp: credentialBackedUp,
			name
		};
	}

	async requestOptions(
		purpose: 'login' | 'reauth',
		userId: string | null
	): Promise<PublicKeyCredentialRequestOptionsJSON> {
		const options = await generateAuthenticationOptions({
			rpID: this.rpID,
			userVerification: 'required'
		});
		await this.factors.createChallenge(
			Buffer.from(options.challenge, 'base64url'),
			purpose,
			userId
		);
		return options;
	}

	async assert(
		response: AuthenticationResponse,
		purpose: 'login' | 'reauth',
		owner: string | null
	): Promise<Assertion | null> {
		const passkey = await this.factors.findPasskey(Buffer.from(response.rawId, 'base64url'));
		if (!passkey || (owner && passkey.userId !== owner)) return null;

		const scope = { userId: passkey.userId, tenantId: passkey.tenantId, role: passkey.role };
		const refused = { ...scope, passkeyId: passkey.id, verified: false, cloned: false };

		const handle = (response.response as { userHandle?: unknown }).userHandle;
		if (
			typeof handle !== 'string' ||
			!Buffer.from(handle, 'base64url').equals(uuidBytes(passkey.userId))
		) {
			return refused;
		}

		const verification = await verifyAuthenticationResponse({
			response: response as unknown as AuthenticationResponseJSON,
			expectedChallenge: (challenge) =>
				this.factors.consumeChallenge(
					Buffer.from(challenge, 'base64url'),
					purpose,
					purpose === 'reauth' ? owner : null
				),
			expectedOrigin: this.origin,
			expectedRPID: this.rpID,
			credential: {
				id: response.rawId,
				publicKey: new Uint8Array(passkey.publicKey),
				counter: 0,
				transports: passkey.transports
			},
			requireUserVerification: true
		}).catch((error: unknown) => {
			this.logger.warn(`Passkey assertion refused: ${String(error)}`);
			return null;
		});
		if (!verification?.verified) return refused;

		const { newCounter, credentialBackedUp } = verification.authenticationInfo;
		const touched = await this.factors.touchPasskey(passkey.id, newCounter, credentialBackedUp);
		return { ...refused, verified: true, cloned: !touched };
	}
}
