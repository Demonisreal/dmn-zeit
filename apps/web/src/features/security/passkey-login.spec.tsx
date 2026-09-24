import { startAuthentication } from '@simplewebauthn/browser';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient, sessionKey } from '../../lib/api/query-client';
import {
	mockAssertion,
	mockMfaSession,
	resetMockSecurity,
	securityHandlers
} from '../../mocks/security';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';

vi.mock('@simplewebauthn/browser', () => ({
	browserSupportsWebAuthn: () => true,
	startAuthentication: vi.fn(),
	startRegistration: vi.fn()
}));

const closedPrompt = () =>
	Object.assign(new Error('The operation either timed out or was not allowed.'), {
		name: 'NotAllowedError'
	});

describe('passkey sign-in', () => {
	beforeEach(() => {
		resetMockSecurity();
		server.use(...securityHandlers);
	});

	it('signs in with the passkey alone and opens the requested page', async () => {
		vi.mocked(startAuthentication).mockResolvedValueOnce(mockAssertion);
		const router = renderApp('/login?next=%2Fsessions');

		await userEvent.click(await screen.findByRole('button', { name: 'Mit Passkey anmelden' }));

		expect(await screen.findByRole('heading', { name: 'Sitzungen' })).toBeInTheDocument();
		expect(router.state.location.pathname).toBe('/sessions');
		expect(queryClient.getQueryData(sessionKey)).toEqual(mockMfaSession);
		expect(startAuthentication).toHaveBeenCalledWith({
			optionsJSON: expect.objectContaining({ userVerification: 'required' })
		});
	});

	it('stays on the login without an error when the browser prompt is closed', async () => {
		vi.mocked(startAuthentication).mockRejectedValueOnce(closedPrompt());
		let verified = false;
		server.use(
			http.post('/api/auth/passkey/verify', () => {
				verified = true;
				return HttpResponse.json(mockMfaSession);
			})
		);
		renderApp('/login');

		await userEvent.click(await screen.findByRole('button', { name: 'Mit Passkey anmelden' }));

		expect(await screen.findByRole('status')).toHaveTextContent('Passkey-Abfrage abgebrochen.');
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Mit Passkey anmelden' })).toBeEnabled();
		expect(verified).toBe(false);
	});

	it('names a passkey that belongs to no account', async () => {
		vi.mocked(startAuthentication).mockResolvedValueOnce(mockAssertion);
		server.use(
			http.post('/api/auth/passkey/verify', () =>
				HttpResponse.json(
					{ code: 'INVALID_CREDENTIALS', message: 'No match', details: null },
					{ status: 401 }
				)
			)
		);
		renderApp('/login');

		await userEvent.click(await screen.findByRole('button', { name: 'Mit Passkey anmelden' }));

		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Dieser Passkey gehört zu keinem Konto in DMN Zeit.'
		);
	});
});
