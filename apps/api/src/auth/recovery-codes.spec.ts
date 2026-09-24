import { recoveryCodeSchema, recoveryCodesSchema } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { hashRecoveryCode, newRecoveryCodes } from './recovery-codes';

describe('recovery codes', () => {
	it('hands out ten distinct codes in the shape of the contract', () => {
		const { codes, hashes } = newRecoveryCodes();
		expect(recoveryCodesSchema.safeParse({ recoveryCodes: codes }).success).toBe(true);
		expect(codes).toHaveLength(10);
		expect(new Set(codes).size).toBe(10);
		expect(hashes.every((hash) => hash.length === 32)).toBe(true);
	});

	it('hashes a code the same however it is typed', () => {
		const { codes, hashes } = newRecoveryCodes();
		const typed = codes[0]!.toLowerCase().replace('-', ' ');
		const normalized = recoveryCodeSchema.parse(typed);

		expect(hashRecoveryCode(normalized).equals(hashes[0]!)).toBe(true);
		expect(hashRecoveryCode(typed).equals(hashes[0]!)).toBe(true);
		expect(hashRecoveryCode(codes[1]!).equals(hashes[0]!)).toBe(false);
	});
});
