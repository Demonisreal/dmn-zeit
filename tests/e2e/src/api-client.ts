import { totpCode } from './totp';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

// mirrors the { code, message, details } shape of apps/api/src/common/*, so months.spec.ts can
// tell a locked period apart from any other failure without parsing the message text
export class ApiRequestError extends Error {
	constructor(
		readonly status: number,
		readonly code: string | undefined
	) {
		super(`${status} ${code ?? ''}`.trim());
	}
}

// what the spa itself sends: same-origin json writes, cookies it was given, csrf token from the answer
export class ApiClient {
	private cookies = new Map<string, string>();
	private csrf: string | undefined;

	constructor(private readonly baseURL: string) {}

	async request<T = unknown>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
		const headers: Record<string, string> = {
			Accept: 'application/json',
			'Sec-Fetch-Site': 'same-origin'
		};
		if (this.cookies.size > 0) {
			headers.Cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
		}
		if (method !== 'GET') {
			headers['Content-Type'] = 'application/json';
			if (this.csrf) headers['X-CSRF-Token'] = this.csrf;
		}

		const res = await fetch(`${this.baseURL}/api${path}`, {
			method,
			headers,
			...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) })
		});
		this.remember(res);

		const json = res.headers.get('content-type')?.includes('application/json')
			? await res.json()
			: undefined;
		if (!res.ok) {
			throw new ApiRequestError(res.status, (json as { code?: string } | undefined)?.code);
		}
		return json as T;
	}

	get<T = unknown>(path: string) {
		return this.request<T>(path);
	}

	post<T = unknown>(path: string, body?: unknown) {
		return this.request<T>(path, 'POST', body);
	}

	patch<T = unknown>(path: string, body?: unknown) {
		return this.request<T>(path, 'PATCH', body);
	}

	put<T = unknown>(path: string, body?: unknown) {
		return this.request<T>(path, 'PUT', body);
	}

	private remember(res: Response) {
		for (const cookie of res.headers.getSetCookie()) {
			const [pair] = cookie.split(';');
			const [name, value] = pair!.split('=');
			this.cookies.set(name!, value!);
		}
	}

	// GET /auth/session hands the synchronizer token back out, the spa reads it the same way
	async refreshCsrf() {
		const session = await this.get<{ csrfToken: string }>('/auth/session');
		this.csrf = session.csrfToken;
		return session;
	}

	// password + totp, the way apps/web/src/app/auth/login-form.tsx and verify-form.tsx do it in two steps
	async login(email: string, password: string, totpSecret: string) {
		const result = await this.post<{ mfaRequired?: true } & Record<string, unknown>>(
			'/auth/login',
			{
				email,
				password
			}
		);
		if (result.mfaRequired) {
			await this.post('/auth/mfa/totp', { code: totpCode(totpSecret) });
		}
		return this.refreshCsrf();
	}

	// continues a session global-setup opened, see Persona.session
	useSession(token: string) {
		this.cookies.set('zeit_sid', token);
		return this.refreshCsrf();
	}

	async acceptInvitation(token: string, password: string) {
		await this.post('/auth/invitations/accept', { token, password });
		return this.refreshCsrf();
	}

	async setUpTotp() {
		const setup = await this.post<{ secret: string }>('/security/totp/setup');
		await this.post('/security/totp/confirm', { code: totpCode(setup.secret) });
		return setup.secret;
	}

	// the raw token a browser context needs as the value of its zeit_sid cookie, see fixtures.ts
	sessionCookie() {
		const token = this.cookies.get('zeit_sid');
		if (!token) throw new Error('not signed in');
		return token;
	}
}
