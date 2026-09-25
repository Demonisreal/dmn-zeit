import { screen, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { mockEmployees, signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';

const frank = mockEmployees.find((employee) => employee.lastName === 'Oberdiek')!;

describe('printed timesheet', () => {
	it('sends a team lead back to the start without asking for the sheet', async () => {
		let asked = false;
		server.use(
			signedInAs('team_lead'),
			http.get('/api/exports/timesheet', () => {
				asked = true;
			})
		);
		const router = renderApp(`/print/timesheet/${frank.id}/2026-08`);

		await waitFor(() => expect(router.state.location.pathname).toBe('/'));
		expect(asked).toBe(false);
	});

	it('knows no sheet for a personnel number in place of the id', async () => {
		server.use(signedInAs('hr'));
		renderApp('/print/timesheet/1002/2026-08');

		expect(
			await screen.findByRole('heading', { name: 'Seite nicht gefunden' })
		).toBeInTheDocument();
	});
});
