import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { todayIso } from '../../lib/dates';
import { renderApp } from '../../test/render-app';
import { clientIds, projectIds, signInForBilling } from './testing';

const nextYear = `01.01.${Number(todayIso().slice(0, 4)) + 1}`;
const rates = () => screen.findByRole('table', { name: 'Sätze' });

describe('rates', () => {
	it('adds a rate for the client from today', async () => {
		let sent: unknown;
		server.use(
			http.post('/api/rates', async ({ request }) => {
				sent = await request.clone().json();
			})
		);
		signInForBilling();
		renderApp(`/billing/clients/${clientIds.hagen}`);

		await userEvent.click(await screen.findByRole('button', { name: 'Satz anlegen' }));
		const form = screen.getByRole('form', { name: 'Satz anlegen' });
		await userEvent.type(within(form).getByLabelText('Satz in €'), '97,50');
		await userEvent.click(within(form).getByRole('button', { name: 'Satz anlegen' }));

		const table = await rates();
		expect(await within(table).findByText('97,50 €')).toBeInTheDocument();
		expect(within(table).getByText('gilt heute')).toBeInTheDocument();
		expect(sent).toEqual({
			clientId: clientIds.hagen,
			projectId: null,
			taskId: null,
			employeeId: null,
			validFrom: todayIso(),
			rateCents: '9750'
		});
	});

	it('does not take an amount it cannot read', async () => {
		signInForBilling();
		renderApp(`/billing/clients/${clientIds.hagen}`);

		await userEvent.click(await screen.findByRole('button', { name: 'Satz anlegen' }));
		const form = screen.getByRole('form', { name: 'Satz anlegen' });
		await userEvent.type(within(form).getByLabelText('Satz in €'), '95 Euro');
		await userEvent.click(within(form).getByRole('button', { name: 'Satz anlegen' }));

		expect(await within(form).findByText('Kein gültiger Betrag')).toBeInTheDocument();
	});

	it('shows task and person rates of a project in their own columns', async () => {
		signInForBilling();
		renderApp(`/billing/projects/${projectIds.brinkmannClosing}`);

		const table = await rates();
		const task = within(table).getByText('Aufgabe „Beratung“').closest('tr')!;
		expect(within(task).getByText('125,00 €')).toBeInTheDocument();
		const person = (await within(table).findByText('Katrin Hölscher')).closest('tr')!;
		expect(within(person).getByText('130,00 €')).toBeInTheDocument();
	});

	it('deletes only a rate that has not started yet', async () => {
		signInForBilling();
		renderApp(`/billing/clients/${clientIds.brinkmann}`);
		const table = await rates();

		const current = within(table).getByText('110,00 €').closest('tr')!;
		expect(within(current).queryByRole('button')).not.toBeInTheDocument();

		await userEvent.click(
			within(table).getByRole('button', { name: `Satz ab ${nextYear} löschen?` })
		);
		const dialog = screen.getByRole('alertdialog', { name: `Satz ab ${nextYear} löschen?` });
		await userEvent.click(within(dialog).getByRole('button', { name: 'Satz löschen' }));

		await waitFor(() => expect(within(table).queryByText('120,00 €')).not.toBeInTheDocument());
	});

	it('explains a refusal when the rate took effect in the meantime', async () => {
		server.use(
			http.delete('/api/rates/:id', () =>
				HttpResponse.json(
					{
						code: 'INVALID_STATE',
						message: 'Only a rate that has not taken effect yet can be removed',
						details: { field: 'validFrom', message: 'rate.futureOnly' }
					},
					{ status: 409 }
				)
			)
		);
		signInForBilling();
		renderApp(`/billing/clients/${clientIds.brinkmann}`);
		const table = await rates();

		await userEvent.click(
			within(table).getByRole('button', { name: `Satz ab ${nextYear} löschen?` })
		);
		const dialog = screen.getByRole('alertdialog', { name: `Satz ab ${nextYear} löschen?` });
		await userEvent.click(within(dialog).getByRole('button', { name: 'Satz löschen' }));

		expect(
			await within(dialog).findByText('Nur ein Satz, der noch nicht gilt, lässt sich löschen')
		).toBeInTheDocument();
	});
});
