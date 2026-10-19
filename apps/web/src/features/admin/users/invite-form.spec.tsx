import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';

beforeEach(() => {
	server.use(signedInAs('admin'));
});

describe('invite', () => {
	it('sends the invitation once more after the sign-in is confirmed again', async () => {
		let posts = 0;
		server.use(
			http.post('/api/users', () => {
				posts += 1;
				if (posts === 1) {
					return HttpResponse.json(
						{ code: 'REAUTH_REQUIRED', message: 'Step-up needed', details: null },
						{ status: 403 }
					);
				}
			}),
			http.post('/api/auth/reauth', () =>
				HttpResponse.json({ reauthUntil: '2026-10-19T12:10:00+02:00' })
			)
		);
		renderApp('/admin');

		await userEvent.click(await screen.findByRole('button', { name: 'Nutzer einladen' }));
		const form = screen.getByRole('form', { name: 'Nutzer einladen' });
		await userEvent.type(within(form).getByLabelText('E-Mail'), 'mara.voss@example.com');
		await userEvent.type(within(form).getByLabelText('Name'), 'Mara Voss');
		await userEvent.click(within(form).getByRole('button', { name: 'Einladung senden' }));

		const reauth = await screen.findByRole('dialog', { name: 'Erneut bestätigen' });
		await userEvent.type(within(reauth).getByLabelText('Passwort'), 'richtiges-passwort');
		await userEvent.type(within(reauth).getByLabelText('Code aus der Authenticator-App'), '123456');
		await userEvent.click(within(reauth).getByRole('button', { name: 'Bestätigen' }));

		expect(
			await screen.findByText('Einladung an mara.voss@example.com verschickt.')
		).toBeInTheDocument();
		const table = await screen.findByRole('table', { name: 'Nutzer' });
		expect(await within(table).findByText('Mara Voss')).toBeInTheDocument();
		expect(posts).toBe(2);
	});
});
