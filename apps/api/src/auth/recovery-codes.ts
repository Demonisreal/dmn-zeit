import { createHmac, randomBytes } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newRecoveryCodes(pepper: Buffer): { codes: string[]; hashes: Buffer[] } {
	const codes = Array.from({ length: 10 }, () => {
		const chars = [...randomBytes(10)].map((byte) => alphabet.charAt(byte % 32)).join('');
		return `${chars.slice(0, 5)}-${chars.slice(5)}`;
	});
	return { codes, hashes: codes.map((code) => hashRecoveryCode(code, pepper)) };
}

export function hashRecoveryCode(code: string, pepper: Buffer): Buffer {
	const key = createHmac('sha256', pepper).update('recovery').digest();
	return createHmac('sha256', key).update(code.replace(/[\s-]/g, '').toUpperCase()).digest();
}
