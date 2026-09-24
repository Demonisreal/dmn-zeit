import { startAuthentication } from '@simplewebauthn/browser';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	mockAssertion,
	mockMfaUser,
	mockTotpCode,
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

const signIn = async () => {
	await screen.findByRole('heading', { name: 'Anmelden' });
	await userEvent.type(screen.getByLabelText('E-Mail'), mockMfaUser.email);
	await userEvent.type(screen.getByLabelText('Passwort'), mockMfaUser.password);
	await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
	await screen.findByRole('heading', { name: 'Anmeldung bestätigen' });
};

describe('second factor after the password', () => {
	beforeEach(() => {
		resetMockSecurity();
		server.use(...securityHandlers);
	});

	it('asks for the authenticator code and then opens the requested page', async () => {
		const router = renderApp('/login?next=%2Fsessions');
		await signIn();
		expect(router.state.location.search).toEqual({
			next: '/sessions',
			methods: ['totp', 'recovery', 'passkey']
		});
		const field = screen.getByLabelText('Code aus der App');
		expect(field).toHaveFocus();

		await userEvent.type(field, '654 321');
		await userEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));
		expect(await screen.findByRole('alert')).toHaveTextContent('Der Code stimmt nicht.');

		await userEvent.clear(field);
		await userEvent.type(field, mockTotpCode);
		await userEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));

		expect(await screen.findByRole('heading', { name: 'Sitzungen' })).toBeInTheDocument();
	});

	it('takes a recovery code in any spelling', async () => {
		renderApp('/login?next=%2Fsessions');
		await signIn();

		await userEvent.click(screen.getByRole('button', { name: 'Wiederherstellungscode' }));
		await userEvent.type(screen.getByLabelText('Wiederherstellungscode'), 'k7m2q xp4rd');
		await userEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));

		expect(await screen.findByRole('heading', { name: 'Sitzungen' })).toBeInTheDocument();
	});

	it('confirms with a passkey instead', async () => {
		vi.mocked(startAuthentication).mockResolvedValueOnce(mockAssertion);
		renderApp('/login?next=%2Fsessions');
		await signIn();

		await userEvent.click(screen.getByRole('button', { name: 'Passkey' }));
		await userEvent.click(screen.getByRole('button', { name: 'Passkey verwenden' }));

		expect(await screen.findByRole('heading', { name: 'Sitzungen' })).toBeInTheDocument();
	});

	it('shows the rate limit the api reports', async () => {
		server.use(
			http.post('/api/auth/mfa/totp', () =>
				HttpResponse.json(
					{ code: 'RATE_LIMITED', message: 'Too many requests', details: null },
					{ status: 429 }
				)
			)
		);
		renderApp('/login');
		await signIn();

		await userEvent.type(screen.getByLabelText('Code aus der App'), mockTotpCode);
		await userEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('Zu viele Versuche.');
	});

	it('sends back to the login once the pending sign-in has run out', async () => {
		renderApp('/login/verify?methods=%5B%22totp%22%5D&next=%2Fsessions');

		await userEvent.type(await screen.findByLabelText('Code aus der App'), mockTotpCode);
		await userEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));

		expect(await screen.findByText(/Der zweite Schritt ist abgelaufen/)).toBeInTheDocument();
		await userEvent.click(screen.getByRole('link', { name: 'Erneut anmelden' }));
		expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
	});

	it('does not stand on its own without the answer of the login', async () => {
		const router = renderApp('/login/verify');

		expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
		expect(router.state.location.pathname).toBe('/login');
	});
});
