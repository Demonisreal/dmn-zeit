import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { hrHandlers, mockEmployees, resetMockHr, signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';

const idOf = (lastName: string) => mockEmployees.find((e) => e.lastName === lastName)!.id;

beforeEach(() => {
	resetMockHr();
	server.use(signedInAs('hr'), ...hrHandlers);
});

describe('leave forfeiture notices', () => {
	it('sends one notice to several people at once', async () => {
		let sent: unknown;
		server.use(
			http.post('/api/vacation/notices', async ({ request }) => {
				sent = await request.clone().json();
			})
		);
		renderApp('/hr/notices');
		const table = await screen.findByRole('table', { name: /Hinweise für/ });

		await userEvent.click(within(table).getByRole('checkbox', { name: 'Deniz Aydın' }));
		await userEvent.click(within(table).getByRole('checkbox', { name: 'Tobias Kämmerer' }));
		await userEvent.click(screen.getByRole('button', { name: /Kanal/ }));
		await userEvent.click(await screen.findByRole('option', { name: 'E-Mail' }));
		await userEvent.click(screen.getByRole('button', { name: 'Hinweis an 2 Personen senden' }));

		expect(await screen.findByText('2 Hinweise versandt.')).toBeInTheDocument();
		expect(sent).toMatchObject({
			employeeIds: [idOf('Aydın'), idOf('Kämmerer')],
			channel: 'email'
		});
		const deniz = within(table).getByText('Deniz Aydın').closest('tr')!;
		expect(await within(deniz).findByText('E-Mail')).toBeInTheDocument();
		expect(within(deniz).getByText('offen')).toBeInTheDocument();
	});

	it('chooses everyone with the box in the header and sends nothing without a choice', async () => {
		renderApp('/hr/notices');
		const table = await screen.findByRole('table', { name: /Hinweise für/ });

		expect(screen.getByRole('button', { name: 'Hinweis an 0 Personen senden' })).toBeDisabled();
		await userEvent.click(within(table).getByRole('checkbox', { name: 'Alle auswählen' }));

		expect(
			screen.getByRole('button', { name: `Hinweis an ${mockEmployees.length - 1} Personen senden` })
		).toBeEnabled();
	});
});
