import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest();
const b64 = (bytes: Buffer | Uint8Array) => Buffer.from(bytes).toString('base64url');

// flag bits of authenticatorData: user present, user verified, attested credential data
const UP = 0x01;
const UV = 0x04;
const AT = 0x40;

function counterBytes(counter: number) {
	const bytes = Buffer.alloc(4);
	bytes.writeUInt32BE(counter);
	return bytes;
}

// a passkey in software with a key pair of this test run, signing the way a real one does
export class SoftAuthenticator {
	readonly credentialId = randomBytes(32);
	counter = 0;
	private readonly keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });

	constructor(
		private readonly origin: string,
		readonly userId: string
	) {}

	get publicKey(): Buffer {
		const { x, y } = this.keys.publicKey.export({ format: 'jwk' });
		// COSE_Key: kty EC2, alg ES256, crv P-256, x, y
		const cose = new Map<number, number | Uint8Array>([
			[1, 2],
			[3, -7],
			[-1, 1],
			[-2, Buffer.from(x!, 'base64url')],
			[-3, Buffer.from(y!, 'base64url')]
		]);
		return Buffer.from(isoCBOR.encode(cose));
	}

	// what navigator.credentials.create hands the spa
	attest(options: { challenge: string }) {
		const clientData = this.clientData('webauthn.create', options.challenge);
		const idLength = Buffer.alloc(2);
		idLength.writeUInt16BE(this.credentialId.length);
		const authData = Buffer.concat([
			this.rpIdHash,
			Buffer.from([UP | UV | AT]),
			counterBytes(this.counter),
			Buffer.alloc(16),
			idLength,
			this.credentialId,
			this.publicKey
		]);
		const attestation = new Map<string, string | Uint8Array | Map<string, never>>([
			['fmt', 'none'],
			['attStmt', new Map<string, never>()],
			['authData', authData]
		]);
		return {
			id: b64(this.credentialId),
			rawId: b64(this.credentialId),
			type: 'public-key',
			response: {
				clientDataJSON: b64(clientData),
				attestationObject: b64(isoCBOR.encode(attestation)),
				transports: ['internal']
			},
			clientExtensionResults: {}
		};
	}

	// what navigator.credentials.get hands the spa; each use moves the counter on
	assert(options: { challenge: string }) {
		this.counter += 1;
		const clientData = this.clientData('webauthn.get', options.challenge);
		const authData = Buffer.concat([
			this.rpIdHash,
			Buffer.from([UP | UV]),
			counterBytes(this.counter)
		]);
		const signature = sign(
			'sha256',
			Buffer.concat([authData, sha256(clientData)]),
			this.keys.privateKey
		);
		return {
			id: b64(this.credentialId),
			rawId: b64(this.credentialId),
			type: 'public-key',
			response: {
				clientDataJSON: b64(clientData),
				authenticatorData: b64(authData),
				signature: b64(signature),
				userHandle: b64(Buffer.from(this.userId.replaceAll('-', ''), 'hex'))
			},
			clientExtensionResults: {}
		};
	}

	private get rpIdHash() {
		return sha256(new URL(this.origin).hostname);
	}

	private clientData(type: string, challenge: string) {
		return Buffer.from(
			JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false })
		);
	}
}
