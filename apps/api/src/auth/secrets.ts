import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const KEY_VERSION = 1;

export function seal(plain: Buffer, key: Buffer, aad: string): Buffer {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(Buffer.from(aad));
	const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
	return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]);
}

export function unseal(sealed: Buffer, key: Buffer, aad: string): Buffer {
	const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12));
	decipher.setAAD(Buffer.from(aad));
	decipher.setAuthTag(sealed.subarray(-16));
	return Buffer.concat([decipher.update(sealed.subarray(12, -16)), decipher.final()]);
}
