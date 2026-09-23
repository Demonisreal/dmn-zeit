import { hasCode } from '../lib/api/errors';

export function errorKey(err: unknown) {
	if (hasCode(err, 'RATE_LIMITED')) return 'common:errors.rateLimited' as const;
	// fetch rejects with a TypeError when the server cannot be reached at all
	if (err instanceof TypeError) return 'common:errors.network' as const;
	return 'common:errors.unexpected' as const;
}
