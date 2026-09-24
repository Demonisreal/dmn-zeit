import { createHash, randomBytes } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ten codes with 50 random bits each, shown once as ABCDE-FGH23 and kept only as sha-256
export function newRecoveryCodes(): { codes: string[]; hashes: Buffer[] } {
	const codes = Array.from({ length: 10 }, () => {
		const chars = [...randomBytes(10)].map((byte) => alphabet.charAt(byte % 32)).join('');
		return `${chars.slice(0, 5)}-${chars.slice(5)}`;
	});
	return { codes, hashes: codes.map(hashRecoveryCode) };
}

// the same hash for ABCDE-FGH23, abcdefgh23 and "abcde fgh23"
export function hashRecoveryCode(code: string): Buffer {
	return createHash('sha256').update(code.replace(/[\s-]/g, '').toUpperCase()).digest();
}
