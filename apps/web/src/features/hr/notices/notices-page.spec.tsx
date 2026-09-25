import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VacationNotice } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { hrHandlers, mockEmployees, resetMockHr, signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';

const idOf = (lastName: string) => mockEmployees.find((e) => e.lastName === lastName)!.id;

const notice = (
	id: string,
	lastName: string,
	channel: VacationNotice['channel']
): VacationNotice => {
	const employee = mockEmployees.find((e) => e.lastName === lastName)!;
	return {
		id,
		employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}` },
		bucketYear: 2026,
		remainingDays: '8.00',
		deadline: '2027-03-31',
		sentAt: '2026-09-15T07:00:00+02:00',
		sentBy: { id: '5b004527-423c-4b82-89ae-323b702a9c62', displayName: 'Sabine Kortmann' },
		channel,
		textVersion: 'notice-2026-1',
		acknowledgedAt: null
	};
};

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

	it('shows the refusal of the api and keeps the choice', async () => {
		server.use(
			http.post('/api/vacation/notices', () =>
				HttpResponse.json(
					{
						code: 'INVALID_STATE',
						message: 'No email address for some of the employees',
						details: null
					},
					{ status: 409 }
				)
			)
		);
		renderApp('/hr/notices');
		const table = await screen.findByRole('table', { name: /Hinweise für/ });

		await userEvent.click(within(table).getByRole('checkbox', { name: 'Deniz Aydın' }));
		await userEvent.click(screen.getByRole('button', { name: /Kanal/ }));
		await userEvent.click(await screen.findByRole('option', { name: 'E-Mail' }));
		await userEvent.click(screen.getByRole('button', { name: 'Hinweis an 1 Person senden' }));

		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Der Stand hat sich inzwischen geändert. Bitte die Seite neu laden.'
		);
		expect(screen.queryByText(/versandt\./)).not.toBeInTheDocument();
		expect(within(table).getByRole('checkbox', { name: 'Deniz Aydın' })).toBeChecked();
	});

	it('loads older notices page by page', async () => {
		const first = {
			items: [notice('00000000-0000-4000-8000-000000000a01', 'Lenz', 'in_app')],
			nextCursor: 'older'
		};
		const older = {
			items: [notice('00000000-0000-4000-8000-000000000a02', 'Brandt', 'letter')],
			nextCursor: null
		};
		server.use(
			http.get('/api/vacation/notices', ({ request }) =>
				HttpResponse.json(new URL(request.url).searchParams.has('cursor') ? older : first)
			)
		);
		renderApp('/hr/notices');
		const table = await screen.findByRole('table', { name: /Hinweise für/ });
		const row = (name: string) => within(table).getByText(name).closest('tr')!;
		expect(
			within(row('Jonas Brandt')).getByText('Noch kein Hinweis für dieses Jahr')
		).toBeInTheDocument();

		await userEvent.click(screen.getByRole('button', { name: 'Ältere Hinweise laden' }));

		expect(await within(row('Jonas Brandt')).findByText('Brief')).toBeInTheDocument();
		expect(within(row('Mara Lenz')).getByText('In der App')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Ältere Hinweise laden' })).not.toBeInTheDocument();
	});
});
