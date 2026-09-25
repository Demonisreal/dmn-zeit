import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { hrHandlers, mockEmployees, resetMockHr, signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';

const frank = mockEmployees.find((employee) => employee.lastName === 'Oberdiek')!;

beforeEach(() => {
	resetMockHr();
	server.use(signedInAs('hr'), ...hrHandlers);
});

describe('exports', () => {
	it('asks for a person before offering the timesheet', async () => {
		renderApp('/hr/exports?month=2026-08');
		const timesheet = await screen.findByRole('region', { name: 'Stundenzettel' });

		expect(
			within(timesheet).getByText('Für den Stundenzettel eine Person wählen.')
		).toBeInTheDocument();
		expect(within(timesheet).queryByRole('link')).not.toBeInTheDocument();
	});

	it('links the csv and the print view of the chosen person', async () => {
		renderApp(`/hr/exports?month=2026-08&employee=${frank.id}`);
		const timesheet = await screen.findByRole('region', { name: 'Stundenzettel' });

		expect(within(timesheet).getByRole('link', { name: 'CSV herunterladen' })).toHaveAttribute(
			'href',
			`/api/exports/timesheet?employee=${frank.id}&month=2026-08&format=csv`
		);
		expect(within(timesheet).getByRole('link', { name: 'Druckansicht öffnen' })).toHaveAttribute(
			'href',
			`/print/timesheet/${frank.id}/2026-08`
		);
	});

	it('offers a retry when the people cannot be loaded', async () => {
		server.use(
			http.get(
				'/api/employees',
				() =>
					HttpResponse.json({ code: 'FORBIDDEN', message: 'No', details: null }, { status: 403 }),
				{ once: true }
			)
		);
		renderApp('/hr/exports?month=2026-08');
		const timesheet = await screen.findByRole('region', { name: 'Stundenzettel' });

		expect(await within(timesheet).findByRole('alert')).toHaveTextContent(
			'Das hat nicht geklappt.'
		);
		await userEvent.click(within(timesheet).getByRole('button', { name: 'Erneut versuchen' }));
		await userEvent.click(within(timesheet).getByRole('button', { name: /Person/ }));

		expect(await screen.findByRole('option', { name: 'Frank Oberdiek' })).toBeInTheDocument();
	});
});
