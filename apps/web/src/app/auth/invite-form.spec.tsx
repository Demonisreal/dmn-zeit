import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { commonPassword, expiredToken } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';

const token = 'Zt3mQ9vK2xR7bN4pL8wC1sD6fG0hJ5yU3aE9iO2kM7n';

const submit = async (password: string, confirm: string) => {
	if (password) await userEvent.type(screen.getByLabelText('Neues Passwort'), password);
	if (confirm) await userEvent.type(screen.getByLabelText('Passwort wiederholen'), confirm);
	await userEvent.click(screen.getByRole('button', { name: 'Passwort festlegen' }));
};

describe('invitation', () => {
	it('shows who is invited to which company and drops the token from the address', async () => {
		const router = renderApp(`/invite#t=${token}`);

		expect(
			await screen.findByText('Einladung von Musterbetrieb (Beispiel) für Jonas Brandt.')
		).toBeInTheDocument();
		expect(screen.getByLabelText('E-Mail')).toHaveValue('jonas.brandt@example.com');
		expect(router.state.location.hash).toBe('');
	});

	it('asks for at least 12 characters', async () => {
		renderApp(`/invite#t=${token}`);
		await screen.findByRole('heading', { name: 'Passwort festlegen' });

		await submit('zu-kurz', 'zu-kurz');

		expect(await screen.findByText('Mindestens 12 Zeichen')).toBeInTheDocument();
	});

	it('notices when the repeated password differs', async () => {
		renderApp(`/invite#t=${token}`);
		await screen.findByRole('heading', { name: 'Passwort festlegen' });

		await submit('lang-genug-und-gut', 'lang-genug-und-gu');

		expect(await screen.findByText('Die Passwörter stimmen nicht überein')).toBeInTheDocument();
		expect(screen.getByLabelText('Passwort wiederholen')).toHaveAttribute('aria-invalid', 'true');
	});

	it('puts the refusal of a common password on the field', async () => {
		renderApp(`/invite#t=${token}`);
		await screen.findByRole('heading', { name: 'Passwort festlegen' });

		await submit(commonPassword, commonPassword);

		expect(await screen.findByText(/steht auf der Liste häufiger Passwörter/)).toBeInTheDocument();
		expect(screen.getByLabelText('Neues Passwort')).toHaveAttribute('aria-invalid', 'true');
	});

	it('continues straight to the setup of a second factor once the password is set', async () => {
		renderApp(`/invite#t=${token}`);
		await screen.findByRole('heading', { name: 'Passwort festlegen' });

		await submit('lang-genug-und-gut', 'lang-genug-und-gut');

		expect(
			await screen.findByRole('heading', { name: 'Zweiten Faktor einrichten' })
		).toBeInTheDocument();
	});

	it('shows the expired link page when the server refuses the token', async () => {
		let inspected = 0;
		server.use(
			http.post('/api/auth/invitations/inspect', () => {
				inspected++;
				return HttpResponse.json(
					{ code: 'TOKEN_INVALID', message: 'Token expired or used', details: null },
					{ status: 400 }
				);
			})
		);

		renderApp(`/invite#t=${expiredToken}`);
		expect(
			await screen.findByRole('heading', { name: 'Link ungültig oder abgelaufen' })
		).toBeInTheDocument();
		expect(inspected).toBe(1);
	});

	it('does not ask the server about a link without a usable token', async () => {
		let inspected = 0;
		server.use(
			http.post('/api/auth/invitations/inspect', () => {
				inspected++;
				return HttpResponse.json({});
			})
		);

		renderApp('/invite#t=abc');

		expect(
			await screen.findByRole('heading', { name: 'Link ungültig oder abgelaufen' })
		).toBeInTheDocument();
		expect(inspected).toBe(0);
	});
});
