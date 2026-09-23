import { apiErrorSchema, type Session } from '@zeit/shared';
import type { ZodType } from 'zod';
import { ApiRequestError } from './errors';
import { queryClient, sessionKey } from './query-client';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type Options<T> = {
	method?: Method;
	body?: unknown;
	schema?: ZodType<T>;
};

export async function request<T = void>(
	path: string,
	{ method = 'GET', body, schema }: Options<T> = {}
): Promise<T> {
	const headers = new Headers({ Accept: 'application/json' });
	const init: RequestInit = { method, headers, credentials: 'same-origin' };

	if (method !== 'GET') {
		// the csrf check only lets json writes through, so an empty body is sent as {}
		headers.set('Content-Type', 'application/json');
		init.body = JSON.stringify(body ?? {});
		const csrf = queryClient.getQueryData<Session | null>(sessionKey)?.csrfToken;
		if (csrf) headers.set('X-CSRF-Token', csrf);
	}

	const res = await fetch(`/api${path}`, init);
	const json: unknown = res.headers.get('Content-Type')?.includes('application/json')
		? await res.json()
		: undefined;

	if (!res.ok) {
		// a proxy error page has no json body, it still gets a code the ui can map
		const parsed = apiErrorSchema.safeParse(json);
		throw new ApiRequestError(
			res.status,
			parsed.success ? parsed.data : { code: 'INTERNAL', message: res.statusText, details: null }
		);
	}

	return schema ? schema.parse(json) : (undefined as T);
}
