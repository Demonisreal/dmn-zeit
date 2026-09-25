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
import { absenceHandlers } from './absences';
import { adminHandlers } from './admin';
import { billingHandlers, resetMockBilling } from './billing';
import { demoHandlers } from './demo';
import { hrHandlers } from './hr';
import { projectHandlers, resetMockProjects } from './projects';
import { securityHandlers } from './security';
import { mockAccounts, mockSession, mockUser } from './session';
import { weekHandlers } from './week';

export { mockSession, mockUser };

export const expiredToken = 'x'.repeat(43);
export const commonPassword = 'passwort1234';

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
				details: [{ field: 'password', code: 'custom', message: 'password.common' }]
			},
			{ status: 400 }
		);
	}
	return null;
};

export const handlers = [
	// the security handlers answer /auth/mfa*, /security* and the passkey-only login, everything else falls through
	...securityHandlers,
	...weekHandlers,
	...projectHandlers,
	// after the project handlers, which answer /projects/bookable and /projects/budgets first
	...billingHandlers,
	...absenceHandlers,
	...hrHandlers,
	...adminHandlers,
	...demoHandlers,

	http.get('/api/auth/session', () =>
		session ? HttpResponse.json(session) : fail(401, 'UNAUTHENTICATED', 'No session')
	),

	http.post('/api/auth/login', async ({ request }) => {
		const { email, password } = (await request.json()) as LoginInput;
		const account = mockAccounts.find(
			(candidate) => candidate.email === email && candidate.password === password
		);
		if (!account) return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
		session = account.session;
		resetMockProjects(account.world, account.session.user.role);
		resetMockBilling(account.world);
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
			tenantName: mockSession.tenant.name
		} satisfies Invitation);
	}),

	http.post('/api/auth/invitations/accept', async ({ request }) => {
		const { token, password } = (await request.json()) as AcceptInvitationInput;
		// accepting always leaves the setup state, the person still has to register a second factor
		return (
			checkNewPassword(token, password) ??
			HttpResponse.json({
				...mockSession,
				security: { enrollmentPending: true, reauthUntil: null }
			})
		);
	}),

	http.patch('/api/me', async ({ request }) => {
		const current = session;
		if (!current) return fail(401, 'UNAUTHENTICATED', 'No session');
		const { locale } = (await request.json()) as { locale: Locale };
		session = { ...current, user: { ...current.user, locale } };
		return HttpResponse.json(session.user);
	})
];
