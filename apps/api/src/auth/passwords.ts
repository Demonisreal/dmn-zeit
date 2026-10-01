import { hash, parseOptions, verify } from '@node-rs/argon2';
import { commonPasswords } from './common-passwords';

const owaspMinimum = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

const dummyHash =
	'$argon2id$v=19$m=19456,t=2,p=1$SrrBENgiaad0JIQ6MdIyyw$00BTpxQBIMUSJse5IlkTo0xzVCxmBqd2Bf7dvkIMXjw';

export function hashPassword(password: string, pepper: Buffer): Promise<string> {
	return hash(password, { ...owaspMinimum, secret: pepper });
}

export function verifyPassword(
	passwordHash: string,
	password: string,
	pepper: Buffer
): Promise<boolean> {
	return verify(passwordHash, password, { secret: pepper });
}

export async function dummyVerify(password: string, pepper: Buffer): Promise<void> {
	await verify(dummyHash, password, { secret: pepper });
}

export function needsRehash(passwordHash: string): boolean {
	const used = parseOptions(passwordHash);
	return used.memoryCost < owaspMinimum.memoryCost || used.timeCost < owaspMinimum.timeCost;
}

export function isCommonPassword(password: string): boolean {
	return commonPasswords.has(password.toLowerCase());
}
