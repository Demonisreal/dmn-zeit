import { Secret, TOTP } from 'otpauth';

// same shape as apps/api/src/auth/totp.ts: sha1, 6 digits, 30s step
export function totpCode(base32Secret: string, at = new Date()): string {
	const totp = new TOTP({
		algorithm: 'SHA1',
		digits: 6,
		period: 30,
		secret: Secret.fromBase32(base32Secret)
	});
	return totp.generate({ timestamp: at.getTime() });
}
