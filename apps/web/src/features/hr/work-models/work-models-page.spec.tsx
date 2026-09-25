import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { hrHandlers, resetMockHr, signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';

beforeEach(() => {
	resetMockHr();
	server.use(signedInAs('hr'), ...hrHandlers);
});

describe('working time models', () => {
	it('creates a model from hours per weekday and adds up the week', async () => {
		let sent: unknown;
		server.use(
			http.post('/api/work-models', async ({ request }) => {
				sent = await request.clone().json();
			})
		);
		renderApp('/hr/work-models');
		await userEvent.click(await screen.findByRole('button', { name: 'Modell anlegen' }));

		const form = screen.getByRole('form', { name: 'Modell anlegen' });
		await userEvent.type(within(form).getByLabelText('Name'), 'Teilzeit 4 Tage (Mo–Do)');
		for (const day of ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag']) {
			await userEvent.type(within(form).getByLabelText(day), '7:30');
		}

		expect(within(form).getByText('30:00 h')).toBeInTheDocument();
		await userEvent.click(within(form).getByRole('button', { name: 'Modell anlegen' }));

		const table = await screen.findByRole('table', { name: 'Arbeitszeitmodelle' });
		expect(await within(table).findByText('Teilzeit 4 Tage (Mo–Do)')).toBeInTheDocument();
		expect(sent).toEqual({
			name: 'Teilzeit 4 Tage (Mo–Do)',
			minutes: { mon: 450, tue: 450, wed: 450, thu: 450, fri: 0, sat: 0, sun: 0 }
		});
	});

	it('does not take more than ten hours on one day', async () => {
		renderApp('/hr/work-models');
		await userEvent.click(await screen.findByRole('button', { name: 'Modell anlegen' }));

		const form = screen.getByRole('form', { name: 'Modell anlegen' });
		await userEvent.type(within(form).getByLabelText('Name'), 'Zu lang');
		await userEvent.type(within(form).getByLabelText('Montag'), '10:30');
		await userEvent.click(within(form).getByRole('button', { name: 'Modell anlegen' }));

		expect(await within(form).findByText('Zwischen 0:00 und 10:00')).toBeInTheDocument();
		expect(within(form).getByLabelText('Montag')).toHaveAttribute('aria-invalid', 'true');
	});

	it('archives a model instead of deleting it', async () => {
		renderApp('/hr/work-models');
		const table = await screen.findByRole('table', { name: 'Arbeitszeitmodelle' });
		const row = within(table).getByText('Teilzeit 20 h (vormittags)').closest('tr')!;

		await userEvent.click(
			within(row).getByRole('button', { name: 'Teilzeit 20 h (vormittags) archivieren' })
		);

		await waitFor(() => expect(screen.queryByText('Teilzeit 20 h (vormittags)')).toBeNull());
		await userEvent.click(screen.getByRole('checkbox', { name: 'Archivierte anzeigen' }));
		const archived = (await screen.findByText('Teilzeit 20 h (vormittags)')).closest('tr')!;
		expect(within(archived).getByText('archiviert')).toBeInTheDocument();
	});
});
