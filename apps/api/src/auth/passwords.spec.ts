import { hash } from '@node-rs/argon2';
import { passwordSchema } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { commonPasswords } from './common-passwords';
import { hashPassword, isCommonPassword, needsRehash, verifyPassword } from './passwords';

describe('passwords', () => {
	it('hashes with argon2id at 19 MiB, two passes, one lane', async () => {
		const stored = await hashPassword('lange genug und geheim');
		expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
		expect(await verifyPassword(stored, 'lange genug und geheim')).toBe(true);
		expect(await verifyPassword(stored, 'lange genug und geheiM')).toBe(false);
	});

	it('wants a rehash once the stored parameters fall behind', async () => {
		expect(needsRehash(await hashPassword('lange genug und geheim'))).toBe(false);
		expect(
			needsRehash(await hash('lange genug und geheim', { memoryCost: 4096, timeCost: 2 }))
		).toBe(true);
		expect(
			needsRehash(await hash('lange genug und geheim', { memoryCost: 19456, timeCost: 1 }))
		).toBe(true);
	});

	it('knows common passwords regardless of case', () => {
		expect(isCommonPassword('Passwort1234')).toBe(true);
		expect(isCommonPassword('QWERTZ123456')).toBe(true);
		expect(isCommonPassword('kaffee ohne milch bitte')).toBe(false);
	});

	it('only lists what gets past the length rule, in the form it is compared', () => {
		for (const common of commonPasswords) {
			expect(passwordSchema.safeParse(common).success, common).toBe(true);
			expect(common, common).toBe(common.toLowerCase());
		}
	});
});
