import { ApiRequestError, hasCode } from '../lib/api/errors';

export function errorKey(err: unknown) {
	if (hasCode(err, 'RATE_LIMITED')) return 'common:errors.rateLimited' as const;
	if (hasCode(err, 'SANDBOX_QUOTA')) return 'common:errors.sandboxQuota' as const;
	// fetch rejects with a TypeError offline, the proxy answers 502 to 504 while the api is down
	if (err instanceof TypeError || (err instanceof ApiRequestError && err.status >= 502)) {
		return 'common:errors.network' as const;
	}
	return 'common:errors.unexpected' as const;
}
