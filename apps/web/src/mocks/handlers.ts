import type {
	AcceptInvitationInput,
	ErrorCode,
	Invitation,
	Locale,
	LoginInput,
	ResetPasswordInput,
	Session
} from '@zeit/shared';
import { http, HttpResponse } from 'msw';

// made up person for working on the ui without the api, not demo data
export const mockUser = { email: 'mara.lenz@example.com', password: 'richtiges-passwort' };
export const expiredToken = 'x'.repeat(43);
export const commonPassword = 'passwort1234';

const signedIn: Session = {
	user: {
		id: '3f6c2a9e-8b1d-4c57-9e0a-5d2b7f4a1c38',
		email: mockUser.email,
		displayName: 'Mara Lenz',
		role: 'admin',
		locale: 'de',
		status: 'active',
		employeeId: '8d41b7c2-0e5f-4a93-b6d8-2c7e9f13a054',
		lastLoginAt: null
	},
	tenant: {
		id: 'c2e8f4a1-6b3d-4f70-8a95-1d4c7b2e9f60',
		name: 'Musterbetrieb (Beispiel)',
		kind: 'live',
		expiresAt: null
	},
	csrfToken: 'mock-csrf-token'
};

let session: Session | null = null;

export const resetMockSession = () => {
	session = null;
};

const fail = (status: number, code: Exclude<ErrorCode, 'VALIDATION'>, message: string) =>
	HttpResponse.json({ code, message, details: null }, { status });

const done = () => new HttpResponse(null, { status: 204 });

const checkNewPassword = (token: string, password: string) => {
	if (token === expiredToken) return fail(400, 'TOKEN_INVALID', 'Token expired or used');
	if (password === commonPassword) {
		return HttpResponse.json(
			{
				code: 'VALIDATION',
				message: 'Invalid input',
				details: [{ field: 'password', message: 'Too common' }]
			},
			{ status: 400 }
		);
	}
	return null;
};

export const handlers = [
	http.get('/api/auth/session', () =>
		session ? HttpResponse.json(session) : fail(401, 'UNAUTHENTICATED', 'No session')
	),

	http.post('/api/auth/login', async ({ request }) => {
		const { email, password } = (await request.json()) as LoginInput;
		if (email !== mockUser.email || password !== mockUser.password) {
			return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
		}
		session = signedIn;
		return HttpResponse.json(session);
	}),

	http.post('/api/auth/logout', ({ request }) => {
		if (request.headers.get('X-CSRF-Token') !== session?.csrfToken) {
			return fail(403, 'CSRF', 'Missing or wrong csrf token');
		}
		session = null;
		return done();
	}),

	http.post('/api/auth/password/forgot', done),

	http.post('/api/auth/password/reset', async ({ request }) => {
		const { token, password } = (await request.json()) as ResetPasswordInput;
		return checkNewPassword(token, password) ?? done();
	}),

	http.post('/api/auth/invitations/inspect', async ({ request }) => {
		const { token } = (await request.json()) as { token: string };
		if (token === expiredToken) return fail(400, 'TOKEN_INVALID', 'Token expired or used');
		return HttpResponse.json({
			email: 'jonas.brandt@example.com',
			displayName: 'Jonas Brandt',
			tenantName: signedIn.tenant.name
		} satisfies Invitation);
	}),

	http.post('/api/auth/invitations/accept', async ({ request }) => {
		const { token, password } = (await request.json()) as AcceptInvitationInput;
		return checkNewPassword(token, password) ?? done();
	}),

	http.patch('/api/me', async ({ request }) => {
		const current = session;
		if (!current) return fail(401, 'UNAUTHENTICATED', 'No session');
		const { locale } = (await request.json()) as { locale: Locale };
		session = { ...current, user: { ...current.user, locale } };
		return HttpResponse.json(session.user);
	})
];
