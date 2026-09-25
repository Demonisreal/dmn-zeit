import type {
	ActiveSession,
	CreatePasskeyInput,
	ErrorCode,
	LoginInput,
	MfaRecoveryInput,
	MfaTotpInput,
	Passkey,
	ReauthInput,
	RenamePasskeyInput,
	Session,
	TotpSetup
} from '@zeit/shared';
import { http, HttpResponse } from 'msw';

// a second made up account that signs in with password and second factor
export const mockMfaUser = { email: 'deniz.aydin@example.com', password: 'richtiges-passwort' };
export const mockTotpCode = '123456';
export const mockRecoveryCode = 'K7M2Q-XP4RD';

export const mockMfaSession: Session = {
	user: {
		id: '9e54ff3b-ee67-48c7-8424-9364dabd4b90',
		email: mockMfaUser.email,
		displayName: 'Deniz Aydın',
		role: 'employee',
		locale: 'de',
		status: 'active',
		employeeId: 'bc1e61b4-d3d8-4290-9124-bc7adf87efde',
		lastLoginAt: '2026-09-23T07:58:12+02:00'
	},
	tenant: {
		id: 'c2e8f4a1-6b3d-4f70-8a95-1d4c7b2e9f60',
		name: 'Musterbetrieb (Beispiel)',
		kind: 'live',
		workspace: 'company',
		expiresAt: null
	},
	mode: 'live',
	leadsTeams: [],
	security: { enrollmentPending: false, reauthUntil: null },
	csrfToken: 'mock-csrf-token-mfa'
};

// what the browser hands back, the mock api never checks a signature
export const mockAssertion = {
	id: 'o3mm9u6vuaVeN4wRgDTidR5oL6ufLTCrE9ISVYbOGUc',
	rawId: 'o3mm9u6vuaVeN4wRgDTidR5oL6ufLTCrE9ISVYbOGUc',
	type: 'public-key' as const,
	response: {
		clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiVG05amFDIn0',
		authenticatorData: 'SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAQ',
		signature: 'MEUCIQDMsvLrI0bm6xg6N8pw4sgNy9ZCvwq2b6NhKtuHPZU2HQIgYN6yNvEzw7sbmqwkqPFnfn5C',
		userHandle: 'P2wqnouLHUycXl3wf0oUOA'
	},
	clientExtensionResults: {},
	authenticatorAttachment: 'platform' as const
};

export const mockAttestation = {
	id: 'Vd4Rk2oXq7c1mT9hYw3LpE6sZbN0aGfU8jKxQ5vC2rI',
	rawId: 'Vd4Rk2oXq7c1mT9hYw3LpE6sZbN0aGfU8jKxQ5vC2rI',
	type: 'public-key' as const,
	response: {
		clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoiUldsdSJ9',
		attestationObject: 'o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YVjFSZYN5YgOjGh0NBcPZHZgW4',
		transports: ['internal', 'hybrid'] as ('internal' | 'hybrid')[]
	},
	clientExtensionResults: { credProps: { rk: true } },
	authenticatorAttachment: 'platform' as const
};

const requestOptions = {
	challenge: 'Tm9jaCBrZWluZSBlY2h0ZSBDaGFsbGVuZ2U',
	rpId: 'localhost',
	userVerification: 'required',
	timeout: 60000,
	allowCredentials: []
};

const creationOptions = {
	challenge: 'RWluIFBhc3NrZXkgZsO8ciBkaWUgRGVtbw',
	rp: { name: 'DMN Zeit', id: 'localhost' },
	user: { id: 'P2wqnouLHUycXl3wf0oUOA', name: 'mara.lenz@example.com', displayName: 'Mara Lenz' },
	pubKeyCredParams: [
		{ type: 'public-key', alg: -8 },
		{ type: 'public-key', alg: -7 },
		{ type: 'public-key', alg: -257 }
	],
	timeout: 60000,
	attestation: 'none',
	excludeCredentials: [],
	authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
};

// looks like the output of the qrcode package, but encodes nothing
const totpSetup: TotpSetup = {
	otpauthUri:
		'otpauth://totp/DMN%20Zeit:mara.lenz%40example.com?issuer=DMN%20Zeit&secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30',
	secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
	qrSvg:
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h29v29H0z"/><path fill="#000000" fill-rule="evenodd" d="M2 2h7v7H2zM3 3h5v5H3zM4 4h3v3H4zM20 2h7v7h-7zM21 3h5v5h-5zM22 4h3v3h-3zM2 20h7v7H2zM3 21h5v5H3zM4 22h3v3H4zM11 2h2v1h-2zM14 3h1v3h-1zM11 7h3v1h-3zM16 5h2v2h-2zM11 11h2v2h-2zM15 10h3v1h-3zM20 12h2v3h-2zM24 11h3v1h-3zM12 15h4v1h-4zM18 17h2v2h-2zM23 16h1v4h-1zM11 20h1v3h-1zM14 22h3v1h-3zM19 21h2v1h-2zM25 22h2v2h-2zM12 25h2v2h-2zM17 25h4v1h-4zM22 26h1v1h-1z"/></svg>'
};

const passkeysAtStart: Passkey[] = [
	{
		id: 'a3f1c9d2-5b7e-4e21-9c8a-1f2d3e4b5c6d',
		name: 'Edge auf Windows',
		createdAt: '2026-08-04T09:12:40+02:00',
		lastUsedAt: '2026-09-24T07:58:03+02:00',
		backedUp: false
	},
	{
		id: 'd81b6e4f-2a9c-4f3d-8e57-6c1a0b9d2e84',
		name: 'iPhone',
		createdAt: '2026-08-19T18:40:11+02:00',
		lastUsedAt: null,
		backedUp: true
	}
];

const sessionsAtStart: ActiveSession[] = [
	{
		id: '5c2e9a7b-3d41-4f86-a0b2-7e9c1d3f5a28',
		createdAt: '2026-09-24T07:58:03+02:00',
		lastSeenAt: '2026-09-24T10:41:27+02:00',
		ip: '203.0.113.24',
		userAgent:
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
		current: true
	},
	{
		id: 'e7a4c1f9-8b2d-4c63-9f15-2a6d8e0b4c71',
		createdAt: '2026-09-22T19:03:55+02:00',
		lastSeenAt: '2026-09-23T21:17:02+02:00',
		ip: '198.51.100.7',
		userAgent:
			'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
		current: false
	},
	{
		id: '1b8f3e6a-4c97-4d20-8e3b-9a5c7f1d2e46',
		createdAt: '2026-09-19T08:14:30+02:00',
		lastSeenAt: '2026-09-19T16:52:48+02:00',
		ip: '2001:db8:4f2a::17',
		userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0',
		current: false
	}
];

let mfaPending = false;
let mfaAttempts = 0;
let reauthUntil: string | null = null;
let totpPending = false;
let hasTotp = true;
let passkeys = passkeysAtStart;
let recoveryLeft = 7;
let sessions = sessionsAtStart;

// 'none' is an account straight from the invitation, still without a second factor
export const resetMockSecurity = (factors: 'enrolled' | 'none' = 'enrolled') => {
	mfaPending = false;
	mfaAttempts = 0;
	reauthUntil = null;
	totpPending = false;
	hasTotp = factors === 'enrolled';
	passkeys = factors === 'enrolled' ? passkeysAtStart : [];
	recoveryLeft = factors === 'enrolled' ? 7 : 0;
	sessions = sessionsAtStart;
};

const fail = (status: number, code: Exclude<ErrorCode, 'VALIDATION'>, message: string) =>
	HttpResponse.json({ code, message, details: null }, { status });

const done = () => new HttpResponse(null, { status: 204 });

const base32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const block = () =>
	Array.from({ length: 5 }, () => base32[Math.floor(Math.random() * 32)]).join('');
const freshCodes = () => Array.from({ length: 10 }, () => `${block()}-${block()}`);

const firstFactor = () => !hasTotp && passkeys.length === 0;
const reauthed = () => reauthUntil !== null && Date.parse(reauthUntil) > Date.now();
const needsReauth = () =>
	fail(403, 'REAUTH_REQUIRED', 'Confirm with your password and second factor first');
const lastFactor = () =>
	fail(409, 'INVALID_STATE', 'Set up another second factor before removing the last one');

const confirmReauth = () => {
	reauthUntil = new Date(Date.now() + 10 * 60_000).toISOString();
	return HttpResponse.json({ reauthUntil });
};

// like the api: a wrong factor counts as an attempt, the fifth one ends the pending sign-in
const secondStep = (matches: boolean) => {
	if (!mfaPending) {
		return fail(
			401,
			'UNAUTHENTICATED',
			'The sign-in step expired, start again with email and password'
		);
	}
	if (matches) {
		mfaPending = false;
		return HttpResponse.json(mockMfaSession);
	}
	mfaAttempts += 1;
	if (mfaAttempts >= 5) mfaPending = false;
	return fail(401, 'INVALID_CREDENTIALS', 'The code or passkey did not match');
};

export const securityHandlers = [
	// answers only for the account with a second factor, every other login falls through
	http.post('/api/auth/login', async ({ request }) => {
		const { email, password } = (await request.clone().json()) as LoginInput;
		if (email !== mockMfaUser.email) return;
		if (password !== mockMfaUser.password) {
			return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
		}
		mfaPending = true;
		mfaAttempts = 0;
		return HttpResponse.json({ mfaRequired: true, methods: ['totp', 'recovery', 'passkey'] });
	}),

	http.post('/api/auth/mfa/totp', async ({ request }) => {
		const { code } = (await request.json()) as MfaTotpInput;
		return secondStep(code === mockTotpCode);
	}),

	http.post('/api/auth/mfa/recovery', async ({ request }) => {
		const { code } = (await request.json()) as MfaRecoveryInput;
		return secondStep(code === mockRecoveryCode.replace('-', ''));
	}),

	http.post('/api/auth/mfa/passkey/options', () => HttpResponse.json(requestOptions)),
	http.post('/api/auth/mfa/passkey', () => secondStep(true)),

	http.post('/api/auth/passkey/options', () => HttpResponse.json(requestOptions)),
	http.post('/api/auth/passkey/verify', () => HttpResponse.json(mockMfaSession)),

	http.post('/api/auth/reauth', async ({ request }) => {
		const { password, code } = (await request.json()) as ReauthInput;
		// same password as mockUser in handlers.ts
		if (password !== 'richtiges-passwort' || code !== mockTotpCode) {
			return fail(403, 'INVALID_CREDENTIALS', 'The code or passkey did not match');
		}
		return confirmReauth();
	}),

	http.post('/api/auth/reauth/passkey/options', () => HttpResponse.json(requestOptions)),
	http.post('/api/auth/reauth/passkey', confirmReauth),

	http.get('/api/auth/sessions', () => HttpResponse.json(sessions)),

	http.delete<{ id: string }>('/api/auth/sessions/:id', ({ params }) => {
		if (!sessions.some((session) => session.id === params.id)) {
			return fail(404, 'NOT_FOUND', 'Session not found');
		}
		sessions = sessions.filter((session) => session.id !== params.id);
		return done();
	}),

	http.get('/api/security', () =>
		HttpResponse.json({
			hasTotp,
			passkeys,
			recoveryCodesLeft: recoveryLeft,
			reauthUntil: reauthed() ? reauthUntil : null
		})
	),

	http.post('/api/security/totp/setup', () => {
		if (hasTotp) return fail(409, 'INVALID_STATE', 'An authenticator app is already set up');
		totpPending = true;
		return HttpResponse.json(totpSetup);
	}),

	http.post('/api/security/totp/confirm', async ({ request }) => {
		if (!firstFactor() && !reauthed()) return needsReauth();
		const { code } = (await request.json()) as MfaTotpInput;
		if (!totpPending || code !== mockTotpCode) {
			return HttpResponse.json(
				{
					code: 'VALIDATION',
					message: 'Invalid input',
					details: [{ field: 'code', code: 'custom', message: 'format.totp' }]
				},
				{ status: 400 }
			);
		}
		const recoveryCodes = firstFactor() ? freshCodes() : [];
		if (recoveryCodes.length > 0) recoveryLeft = 10;
		hasTotp = true;
		totpPending = false;
		return HttpResponse.json({ recoveryCodes });
	}),

	http.delete('/api/security/totp', () => {
		if (!reauthed()) return needsReauth();
		if (!hasTotp) return fail(404, 'NOT_FOUND', 'No authenticator app is set up');
		if (passkeys.length === 0) return lastFactor();
		hasTotp = false;
		return done();
	}),

	http.post('/api/security/passkeys/options', () => HttpResponse.json(creationOptions)),

	http.post('/api/security/passkeys', async ({ request }) => {
		if (!firstFactor() && !reauthed()) return needsReauth();
		const { name } = (await request.json()) as CreatePasskeyInput;
		const recoveryCodes = firstFactor() ? freshCodes() : [];
		if (recoveryCodes.length > 0) recoveryLeft = 10;
		const passkey: Passkey = {
			id: crypto.randomUUID(),
			name,
			createdAt: new Date().toISOString(),
			lastUsedAt: null,
			backedUp: true
		};
		passkeys = [...passkeys, passkey];
		return HttpResponse.json({ passkey, recoveryCodes }, { status: 201 });
	}),

	http.patch<{ id: string }>('/api/security/passkeys/:id', async ({ params, request }) => {
		const { name } = (await request.json()) as RenamePasskeyInput;
		if (!passkeys.some((passkey) => passkey.id === params.id)) {
			return fail(404, 'NOT_FOUND', 'Passkey not found');
		}
		passkeys = passkeys.map((passkey) =>
			passkey.id === params.id ? { ...passkey, name } : passkey
		);
		return done();
	}),

	http.delete<{ id: string }>('/api/security/passkeys/:id', ({ params }) => {
		if (!reauthed()) return needsReauth();
		if (!passkeys.some((passkey) => passkey.id === params.id)) {
			return fail(404, 'NOT_FOUND', 'Passkey not found');
		}
		if (!hasTotp && passkeys.length === 1) return lastFactor();
		passkeys = passkeys.filter((passkey) => passkey.id !== params.id);
		return done();
	}),

	http.post('/api/security/recovery-codes', () => {
		if (!reauthed()) return needsReauth();
		if (firstFactor()) {
			return fail(409, 'INVALID_STATE', 'Recovery codes need a second factor to go with');
		}
		recoveryLeft = 10;
		return HttpResponse.json({ recoveryCodes: freshCodes() });
	})
];
