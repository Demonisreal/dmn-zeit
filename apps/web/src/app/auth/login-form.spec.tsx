import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { mockSession, mockUser } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';

const fill = async (email: string, password: string) => {
	if (email) await userEvent.type(screen.getByLabelText('E-Mail'), email);
	if (password) await userEvent.type(screen.getByLabelText('Passwort'), password);
	await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
};

describe('login', () => {
	it('names both empty fields and sends nothing', async () => {
		let sent = false;
		server.use(
			http.post('/api/auth/login', () => {
				sent = true;
				return new HttpResponse(null, { status: 204 });
			})
		);
		renderApp('/login');
		await screen.findByRole('heading', { name: 'Anmelden' });

		await fill('', '');

		expect(await screen.findAllByText('Pflichtfeld')).toHaveLength(2);
		expect(screen.getByLabelText('E-Mail')).toHaveAttribute('aria-invalid', 'true');
		expect(screen.getByLabelText('E-Mail')).toHaveFocus();
		expect(sent).toBe(false);
	});

	it('rejects an address without a domain', async () => {
		renderApp('/login');
		await screen.findByRole('heading', { name: 'Anmelden' });

		await fill('mara.lenz', 'irgendwas');

		expect(await screen.findByText('Keine gültige E-Mail-Adresse')).toBeInTheDocument();
	});

	it('says so when email or password is wrong', async () => {
		renderApp('/login');
		await screen.findByRole('heading', { name: 'Anmelden' });

		await fill(mockUser.email, 'falsches-passwort');

		expect(await screen.findByRole('alert')).toHaveTextContent('E-Mail oder Passwort ist falsch.');
	});

	it('opens the week after a successful login', async () => {
		renderApp('/login');
		await screen.findByRole('heading', { name: 'Anmelden' });

		await fill(mockUser.email, mockUser.password);

		expect(await screen.findByRole('heading', { name: 'Woche' })).toBeInTheDocument();
		expect(screen.getByText('Musterbetrieb (Beispiel)')).toBeInTheDocument();
	});

	it('sends visitors without a session to the login and back afterwards', async () => {
		const router = renderApp('/vacation');
		await screen.findByRole('heading', { name: 'Anmelden' });
		expect(router.state.location.search).toEqual({ next: '/vacation' });

		await fill(mockUser.email, mockUser.password);

		// the leave page loads its own data, arriving there is what counts here
		await waitFor(() => expect(router.state.location.pathname).toBe('/vacation'));
	});

	it('asks for the second factor when the password alone is not enough', async () => {
		server.use(
			http.post('/api/auth/login', () =>
				HttpResponse.json({ mfaRequired: true, methods: ['totp', 'passkey'] })
			)
		);
		const router = renderApp('/login?next=%2Fvacation');
		await screen.findByRole('heading', { name: 'Anmelden' });

		await fill(mockUser.email, mockUser.password);

		expect(
			await screen.findByRole('heading', { name: 'Anmeldung bestätigen' })
		).toBeInTheDocument();
		expect(router.state.location.search).toEqual({
			next: '/vacation',
			methods: ['totp', 'passkey']
		});
	});

	it('keeps a new account on the setup page until a second factor exists', async () => {
		const pending = { ...mockSession, security: { enrollmentPending: true, reauthUntil: null } };
		server.use(http.post('/api/auth/login', () => HttpResponse.json(pending)));
		renderApp('/login');
		await screen.findByRole('heading', { name: 'Anmelden' });

		await fill(mockUser.email, mockUser.password);

		expect(
			await screen.findByRole('heading', { name: 'Zweiten Faktor einrichten' })
		).toBeInTheDocument();
	});
});
