import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { seal, unseal } from './secrets';

// test keys, generated per run
const key = randomBytes(32);
const anna = '0b1a4f0e-9c1d-4e8a-8f3b-2d5c6e7f8a90';
const ben = '5d2e6f1a-3b4c-4d5e-9f6a-7b8c9d0e1f2a';

describe('seal and unseal', () => {
	it('gets the secret back with the same key and person', () => {
		const secret = randomBytes(20);
		expect(unseal(seal(secret, key, anna), key, anna).equals(secret)).toBe(true);
	});

	it('lays out iv, ciphertext and tag, with a fresh iv each time', () => {
		const secret = randomBytes(20);
		const first = seal(secret, key, anna);
		expect(first).toHaveLength(12 + 20 + 16);
		expect(seal(secret, key, anna).subarray(0, 12).equals(first.subarray(0, 12))).toBe(false);
	});

	it('refuses another key', () => {
		expect(() => unseal(seal(randomBytes(20), key, anna), randomBytes(32), anna)).toThrow();
	});

	it('refuses a secret copied over to another person', () => {
		expect(() => unseal(seal(randomBytes(20), key, anna), key, ben)).toThrow();
	});

	it('refuses a ciphertext that was tampered with', () => {
		const sealed = seal(randomBytes(20), key, anna);
		sealed[15] = sealed[15]! ^ 1;
		expect(() => unseal(sealed, key, anna)).toThrow();
	});
});
