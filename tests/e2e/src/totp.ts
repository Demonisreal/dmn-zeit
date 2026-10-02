import { Secret, TOTP } from 'otpauth';

export const STEP_MS = 30_000;

// same shape as apps/api/src/auth/totp.ts: sha1, 6 digits, 30s step
export function totpCode(base32Secret: string, at = new Date()): string {
	const totp = new TOTP({
		algorithm: 'SHA1',
		digits: 6,
		period: STEP_MS / 1000,
		secret: Secret.fromBase32(base32Secret)
	});
	return totp.generate({ timestamp: at.getTime() });
}

export function untilNextStep() {
	return new Promise((resolve) => setTimeout(resolve, STEP_MS - (Date.now() % STEP_MS) + 250));
}
