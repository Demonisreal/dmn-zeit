import { randomBytes } from 'node:crypto';
import { seedSql } from '../docker';

// same shape as apps/api/src/auth/tokens.ts newToken(), the db only ever sees the hash of it
export function mintInviteToken(userId: string): string {
	const token = randomBytes(32).toString('base64url');
	seedSql(`select auth.token_issue('${userId}'::uuid, 'invite', sha256('${token}'::bytea));`);
	return token;
}
