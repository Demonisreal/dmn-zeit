import { randomBytes } from 'node:crypto';
import type { TotpSetup } from '@zeit/shared';
import { Secret, TOTP } from 'otpauth';
import * as qrcode from 'qrcode';

function totpOf(secret: Buffer, label = '') {
	return new TOTP({
		issuer: 'DMN Zeit',
		label,
		algorithm: 'SHA1',
		digits: 6,
		period: 30,
		secret: Secret.fromHex(secret.toString('hex'))
	});
}

export function newTotpSecret(): Buffer {
	return randomBytes(20);
}

// the svg holds nothing but the module paths, the web shows it as an <img> from a data uri
export async function totpSetup(secret: Buffer, email: string): Promise<TotpSetup> {
	const totp = totpOf(secret, email);
	const otpauthUri = totp.toString();
	return {
		otpauthUri,
		secret: totp.secret.base32,
		qrSvg: await qrcode.toString(otpauthUri, { type: 'svg', margin: 2 })
	};
}

// the 30-second step the code belongs to, one step either side for clocks that drift
export function stepOf(secret: Buffer, code: string, now: Date): number | null {
	const totp = totpOf(secret);
	const timestamp = now.getTime();
	const delta = totp.validate({ token: code, timestamp, window: 1 });
	return delta === null ? null : totp.counter({ timestamp }) + delta;
}
