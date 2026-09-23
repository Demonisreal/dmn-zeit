import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '../common/session.guard';
import type { AuthStore, NewSession, Profile, SessionRow } from './auth.store';
import { SessionService } from './session.service';
import { csrfTokenFor, hashToken } from './tokens';

const profile: Profile = {
	user: {
		id: 'u1',
		email: 'anna@muster.test',
		displayName: 'Anna Admin',
		role: 'admin',
		locale: 'de',
		status: 'active',
		employeeId: null,
		lastLoginAt: '2026-09-24T06:00:00Z'
	},
	tenant: { id: 't1', name: 'Steuerbüro Muster', kind: 'live', expiresAt: null }
};

function setup(origin = 'https://zeit.example.com') {
	const rows = new Map<string, SessionRow>();
	const store = {
		createSession: vi.fn(async (userId: string, session: NewSession) => {
			rows.set(session.tokenHash.toString('hex'), {
				id: `s${rows.size + 1}`,
				userId,
				tenantId: 't1',
				role: 'admin',
				employeeId: null,
				csrfHash: session.csrfHash
			});
		}),
		resolveSession: vi.fn(async (tokenHash: Buffer) => rows.get(tokenHash.toString('hex'))),
		profile: vi.fn(async () => profile),
		revokeSession: vi.fn(async () => true)
	};
	const sessions = new SessionService(
		store as unknown as AuthStore,
		new ConfigService({ APP_ORIGIN: origin })
	);
	const response = { cookie: vi.fn(), clearCookie: vi.fn() };
	return { sessions, store, response, asResponse: response as unknown as Response };
}

const client = { requestId: 'r1', ip: '203.0.113.7', userAgent: 'Firefox' };

describe('SessionService', () => {
	it('sets a __Host- cookie behind https', async () => {
		const { sessions, response, asResponse } = setup();
		await sessions.open(asResponse, 'u1', client);

		expect(sessions.cookieName).toBe('__Host-zeit_sid');
		expect(response.cookie).toHaveBeenCalledWith('__Host-zeit_sid', expect.any(String), {
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			path: '/'
		});
	});

	it('drops prefix and Secure on plain http, a local browser would refuse both', async () => {
		const { sessions, response, asResponse } = setup('http://localhost:5173');
		await sessions.open(asResponse, 'u1', client);

		expect(sessions.cookieName).toBe('zeit_sid');
		expect(response.cookie.mock.calls[0]?.[2]).toMatchObject({ secure: false, httpOnly: true });
	});

	it('keeps only hashes in the store and hands the csrf token to the client', async () => {
		const { sessions, store, response, asResponse } = setup();
		const opened = await sessions.open(asResponse, 'u1', client);
		const token = response.cookie.mock.calls[0]?.[1] as string;

		expect(store.createSession).toHaveBeenCalledWith('u1', {
			tokenHash: hashToken(token),
			csrfHash: hashToken(csrfTokenFor(token)),
			ip: '203.0.113.7',
			userAgent: 'Firefox'
		});
		expect(opened).toEqual({ ...profile, csrfToken: csrfTokenFor(token) });
	});

	it('resolves the session from the cookie and remembers the request id', async () => {
		const { sessions, response, asResponse } = setup();
		await sessions.open(asResponse, 'u1', client);
		const token = response.cookie.mock.calls[0]?.[1] as string;

		const request = { id: 'r2', cookies: { '__Host-zeit_sid': token } } as unknown as Request;
		expect(await sessions.resolve(request)).toMatchObject({
			id: 's1',
			userId: 'u1',
			requestId: 'r2'
		});
	});

	it('does not ask the database without a cookie', async () => {
		const { sessions, store } = setup();
		expect(await sessions.resolve({ id: 'r3', cookies: {} } as unknown as Request)).toBeUndefined();
		expect(store.resolveSession).not.toHaveBeenCalled();
	});

	it('clears the cookie only when the current session is the one ended', async () => {
		const { sessions, response, asResponse } = setup();
		const current = { id: 's1', userId: 'u1' } as AuthSession;

		await sessions.revoke(current, 's2', asResponse);
		expect(response.clearCookie).not.toHaveBeenCalled();

		await sessions.revoke(current, 's1', asResponse);
		expect(response.clearCookie).toHaveBeenCalledWith('__Host-zeit_sid', expect.anything());
	});
});
