import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiRequestError, hasCode } from './errors';

export const sessionKey = ['session'] as const;

const dropSession = (err: Error) => {
	if (hasCode(err, 'UNAUTHENTICATED')) queryClient.setQueryData(sessionKey, null);
};

export const queryClient = new QueryClient({
	queryCache: new QueryCache({ onError: dropSession }),
	mutationCache: new MutationCache({ onError: dropSession }),
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: (count, err) => count < 2 && !(err instanceof ApiRequestError && err.status < 500)
		}
	}
});
