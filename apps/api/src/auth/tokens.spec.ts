import { tokenSchema } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { csrfMatches, csrfTokenFor, hashToken, newToken } from './tokens';

describe('tokens', () => {
	it('hands out 32 random bytes in the format the contract expects', () => {
		const token = newToken();
		expect(tokenSchema.safeParse(token).success).toBe(true);
		expect(newToken()).not.toBe(token);
	});

	it('stores 32 bytes, as the check constraint in auth wants', () => {
		expect(hashToken(newToken())).toHaveLength(32);
	});

	it('derives the same csrf token from the same session, and a different one otherwise', () => {
		const token = newToken();
		expect(csrfTokenFor(token)).toBe(csrfTokenFor(token));
		expect(csrfTokenFor(token)).not.toBe(csrfTokenFor(newToken()));
		expect(csrfTokenFor(token)).not.toContain(token);
	});
});

describe('csrfMatches', () => {
	const csrf = csrfTokenFor(newToken());
	const stored = hashToken(csrf);

	it('accepts the token that belongs to the stored hash', () => {
		expect(csrfMatches(csrf, stored)).toBe(true);
	});

	it('refuses anything else without throwing on odd lengths', () => {
		expect(csrfMatches(undefined, stored)).toBe(false);
		expect(csrfMatches('', stored)).toBe(false);
		expect(csrfMatches('x', stored)).toBe(false);
		expect(csrfMatches(`${csrf}x`, stored)).toBe(false);
	});
});
