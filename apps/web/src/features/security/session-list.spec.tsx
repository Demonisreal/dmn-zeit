import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryClient, sessionKey } from '../../lib/api/query-client';
import { mockSession } from '../../mocks/handlers';
import { resetMockSecurity, securityHandlers } from '../../mocks/security';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';

describe('sessions', () => {
	beforeEach(() => {
		resetMockSecurity();
		server.use(...securityHandlers);
		queryClient.setQueryData(sessionKey, mockSession);
	});

	it('lists the own session first and names the devices', async () => {
		renderApp('/sessions');

		const table = await screen.findByRole('table', { name: 'Angemeldete Sitzungen' });
		const rows = within(table).getAllByRole('row').slice(1);
		expect(rows.map((row) => within(row).getAllByRole('cell')[0]!.textContent)).toEqual([
			'Edge auf Windowsdiese Sitzung',
			'Safari auf iOS',
			'Firefox auf Linux'
		]);
		expect(rows[0]).toHaveAttribute('data-current', 'true');
		expect(within(rows[0]!).queryByRole('button')).not.toBeInTheDocument();
		expect(rows[2]).toHaveTextContent('2001:db8:4f2a::17');
	});

	it('ends another session', async () => {
		renderApp('/sessions');
		await screen.findByRole('table', { name: 'Angemeldete Sitzungen' });

		await userEvent.click(
			screen.getByRole('button', { name: 'Sitzung Firefox auf Linux beenden' })
		);

		await waitFor(() => expect(screen.queryByText('Firefox auf Linux')).not.toBeInTheDocument());
		expect(screen.getAllByRole('row')).toHaveLength(3);
	});

	it('offers a retry when the list cannot be loaded', async () => {
		server.use(
			http.get('/api/auth/sessions', () =>
				HttpResponse.json({ code: 'FORBIDDEN', message: 'No', details: null }, { status: 403 })
			)
		);
		renderApp('/sessions');

		expect(await screen.findByRole('alert')).toHaveTextContent('Das hat nicht geklappt.');
		expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
	});
});
