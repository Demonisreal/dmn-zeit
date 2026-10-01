import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function newToken(): string {
	return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): Buffer {
	return createHash('sha256').update(token).digest();
}

export function csrfTokenFor(sessionToken: string): string {
	return createHmac('sha256', sessionToken).update('csrf').digest('base64url');
}

export function csrfMatches(sent: string | undefined, csrfHash: Buffer): boolean {
	return !!sent && timingSafeEqual(hashToken(sent), csrfHash);
}
