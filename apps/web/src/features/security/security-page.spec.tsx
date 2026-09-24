import { startAuthentication } from '@simplewebauthn/browser';
import type { Session } from '@zeit/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient, sessionKey } from '../../lib/api/query-client';
import { mockSession, mockUser } from '../../mocks/handlers';
import {
	mockAssertion,
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

const open = async () => {
	renderApp('/security');
	await screen.findByRole('table', { name: 'Passkeys' });
};

describe('security page', () => {
	beforeEach(() => {
		resetMockSecurity();
		server.use(...securityHandlers);
		queryClient.setQueryData(sessionKey, mockSession);
	});

	it('shows passkeys, the authenticator app and the recovery codes left', async () => {
		await open();

		const rows = within(screen.getByRole('table', { name: 'Passkeys' })).getAllByRole('row');
		expect(rows[1]).toHaveTextContent('Edge auf Windows');
		expect(rows[1]).toHaveTextContent('an ein Gerät gebunden');
		expect(rows[2]).toHaveTextContent('iPhone');
		expect(rows[2]).toHaveTextContent('noch nie');
		expect(screen.getByText('eingerichtet')).toBeInTheDocument();
		expect(screen.getByText('Noch 7 von 10 Codes übrig.')).toBeInTheDocument();
	});

	it('asks for a step-up when the api wants one, then removes the app', async () => {
		await open();

		await userEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
		const confirm = await screen.findByRole('alertdialog', {
			name: 'Authenticator-App entfernen?'
		});
		await userEvent.click(within(confirm).getByRole('button', { name: 'Entfernen' }));

		const stepUp = await screen.findByRole('dialog', { name: 'Erneut bestätigen' });
		await userEvent.type(within(stepUp).getByLabelText('Passwort'), 'falsch-geraten');
		await userEvent.type(
			within(stepUp).getByLabelText('Code aus der Authenticator-App'),
			mockTotpCode
		);
		await userEvent.click(within(stepUp).getByRole('button', { name: 'Bestätigen' }));
		expect(await within(stepUp).findByRole('alert')).toHaveTextContent(
			'Passwort oder Code stimmt nicht.'
		);

		await userEvent.clear(within(stepUp).getByLabelText('Passwort'));
		await userEvent.type(within(stepUp).getByLabelText('Passwort'), mockUser.password);
		await userEvent.click(within(stepUp).getByRole('button', { name: 'Bestätigen' }));

		expect(
			await screen.findByRole('button', { name: 'Authenticator-App einrichten' })
		).toBeInTheDocument();
		expect(screen.getByText('nicht eingerichtet')).toBeInTheDocument();
		expect(queryClient.getQueryData<Session>(sessionKey)?.security.reauthUntil).toEqual(
			expect.any(String)
		);
	});

	it('closes the step-up without retrying when it is cancelled', async () => {
		let removed = false;
		server.use(
			http.delete('/api/security/totp', () => {
				removed = true;
				return HttpResponse.json(
					{ code: 'REAUTH_REQUIRED', message: 'Confirm first', details: null },
					{ status: 403 }
				);
			})
		);
		await open();

		await userEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
		await userEvent.click(
			within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Entfernen' })
		);
		const stepUp = await screen.findByRole('dialog', { name: 'Erneut bestätigen' });
		await userEvent.click(within(stepUp).getByRole('button', { name: 'Abbrechen' }));

		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
		expect(removed).toBe(true);
		expect(screen.getByText('eingerichtet')).toBeInTheDocument();
	});

	it('renames a passkey in its row', async () => {
		await open();

		await userEvent.click(screen.getByRole('button', { name: 'Edge auf Windows umbenennen' }));
		const name = screen.getByLabelText('Name');
		expect(name).toHaveFocus();
		await userEvent.clear(name);
		await userEvent.type(name, 'Laptop Büro');
		await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		expect(await screen.findByText('Laptop Büro')).toBeInTheDocument();
		expect(screen.queryByText('Edge auf Windows')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Laptop Büro umbenennen' })).toHaveFocus();
	});

	it('explains why the last second factor stays', async () => {
		server.use(
			http.delete('/api/security/passkeys/:id', () =>
				HttpResponse.json(
					{ code: 'INVALID_STATE', message: 'Last factor', details: null },
					{ status: 409 }
				)
			)
		);
		await open();

		await userEvent.click(screen.getByRole('button', { name: 'iPhone entfernen' }));
		const confirm = await screen.findByRole('alertdialog', { name: 'Passkey „iPhone“ entfernen?' });
		await userEvent.click(within(confirm).getByRole('button', { name: 'Entfernen' }));

		expect(await within(confirm).findByRole('alert')).toHaveTextContent(
			'Das ist der letzte zweite Faktor.'
		);
	});

	it('renews the recovery codes after a step-up with a passkey and shows them once', async () => {
		vi.mocked(startAuthentication).mockResolvedValueOnce(mockAssertion);
		await open();

		await userEvent.click(screen.getByRole('button', { name: 'Neue Codes erzeugen' }));
		const confirm = await screen.findByRole('alertdialog');
		await userEvent.click(within(confirm).getByRole('button', { name: 'Neue Codes erzeugen' }));
		const stepUp = await screen.findByRole('dialog', { name: 'Erneut bestätigen' });
		await userEvent.click(within(stepUp).getByRole('button', { name: 'Mit Passkey bestätigen' }));

		const list = await screen.findByRole('list', { name: 'Wiederherstellungscodes' });
		expect(within(list).getAllByRole('listitem')).toHaveLength(10);

		await userEvent.click(screen.getByRole('checkbox', { name: /Codes an einem sicheren Ort/ }));
		await userEvent.click(screen.getByRole('button', { name: 'Fertig' }));

		expect(await screen.findByText('Noch 10 von 10 Codes übrig.')).toBeInTheDocument();
		expect(screen.queryByRole('list', { name: 'Wiederherstellungscodes' })).not.toBeInTheDocument();
	});
});
