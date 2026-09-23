import { hash, parseOptions, verify } from '@node-rs/argon2';
import { commonPasswords } from './common-passwords';

// owasp minimum for argon2id, the library defaults to the id variant
const options = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

// baked in rather than hashed at startup, otherwise the first unknown address would answer slower
const dummyHash =
	'$argon2id$v=19$m=19456,t=2,p=1$SrrBENgiaad0JIQ6MdIyyw$00BTpxQBIMUSJse5IlkTo0xzVCxmBqd2Bf7dvkIMXjw';

// the pepper goes in as argon2 secret, so a copy of the database alone is no use for guessing
export function hashPassword(password: string, pepper: Buffer): Promise<string> {
	return hash(password, { ...options, secret: pepper });
}

export function verifyPassword(
	passwordHash: string,
	password: string,
	pepper: Buffer
): Promise<boolean> {
	return verify(passwordHash, password, { secret: pepper });
}

// costs as much as a real check, so the answer time does not tell whether the address exists
export async function dummyVerify(password: string, pepper: Buffer): Promise<void> {
	await verify(dummyHash, password, { secret: pepper });
}

export function needsRehash(passwordHash: string): boolean {
	const used = parseOptions(passwordHash);
	return used.memoryCost < options.memoryCost || used.timeCost < options.timeCost;
}

// length is already checked by the zod schema, this adds what a schema cannot know
export function isCommonPassword(password: string): boolean {
	return commonPasswords.has(password.toLowerCase());
}
