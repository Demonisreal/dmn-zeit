import { createHash, randomBytes } from 'node:crypto';
import { recoveryCodeSchema, recoveryCodesSchema } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { hashRecoveryCode, newRecoveryCodes } from './recovery-codes';

const pepper = randomBytes(32);

describe('recovery codes', () => {
	it('hands out ten distinct codes in the shape of the contract', () => {
		const { codes, hashes } = newRecoveryCodes(pepper);
		expect(recoveryCodesSchema.safeParse({ recoveryCodes: codes }).success).toBe(true);
		expect(codes).toHaveLength(10);
		expect(new Set(codes).size).toBe(10);
		expect(hashes.every((hash) => hash.length === 32)).toBe(true);
	});

	it('hashes a code the same however it is typed', () => {
		const { codes, hashes } = newRecoveryCodes(pepper);
		const typed = codes[0]!.toLowerCase().replace('-', ' ');
		const normalized = recoveryCodeSchema.parse(typed);

		expect(hashRecoveryCode(normalized, pepper).equals(hashes[0]!)).toBe(true);
		expect(hashRecoveryCode(typed, pepper).equals(hashes[0]!)).toBe(true);
		expect(hashRecoveryCode(codes[1]!, pepper).equals(hashes[0]!)).toBe(false);
	});

	it('needs the pepper, a leaked table alone does not let anyone try codes offline', () => {
		const { codes, hashes } = newRecoveryCodes(pepper);
		const plain = createHash('sha256').update(codes[0]!.replace('-', '')).digest();

		expect(hashes[0]!.equals(plain)).toBe(false);
		expect(hashRecoveryCode(codes[0]!, randomBytes(32)).equals(hashes[0]!)).toBe(false);
	});
});
