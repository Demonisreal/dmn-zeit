import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { signInForBilling } from './testing';

const clientsTable = () => screen.findByRole('table', { name: 'Kunden' });
const rowOf = (table: HTMLElement, name: string) =>
	within(table).getByRole('link', { name }).closest('tr')!;

describe('clients', () => {
	it('lists active clients with their projects and shows archived ones on request', async () => {
		signInForBilling();
		renderApp('/billing/clients');
		const table = await clientsTable();

		const hagen = rowOf(table, 'Bäckerei Hagen GmbH (Beispiel)');
		expect(await within(hagen).findByText('2')).toBeInTheDocument();
		expect(within(table).getByText(/Förderverein der Offenen Ganztagsschule/)).toBeInTheDocument();
		expect(within(table).queryByText('Friseursalon Beckmann (Beispiel)')).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole('checkbox', { name: 'Archivierte anzeigen' }));
		const archived = rowOf(table, 'Friseursalon Beckmann (Beispiel)');
		expect(within(archived).getByText('archiviert')).toBeInTheDocument();

		await userEvent.type(screen.getByLabelText('Name oder Kundennummer'), 'K-1002');
		expect(within(table).getAllByRole('link')).toHaveLength(1);
	});

	it('creates a client and opens its page', async () => {
		let sent: unknown;
		server.use(
			http.post('/api/clients', async ({ request }) => {
				sent = await request.clone().json();
			})
		);
		signInForBilling();
		renderApp('/billing/clients');
		await clientsTable();
		await userEvent.click(screen.getByRole('button', { name: 'Kunde anlegen' }));

		const form = screen.getByRole('form', { name: 'Kunde anlegen' });
		await userEvent.type(within(form).getByLabelText('Name'), 'Malerbetrieb Sander (Beispiel)');
		await userEvent.type(within(form).getByLabelText('PLZ'), '44787');
		await userEvent.type(within(form).getByLabelText('Ort'), 'Bochum');
		await userEvent.type(within(form).getByLabelText('Zahlungsziel'), '21');
		await userEvent.click(within(form).getByRole('button', { name: 'Kunde anlegen' }));

		expect(
			await screen.findByRole('heading', { level: 1, name: 'Malerbetrieb Sander (Beispiel)' })
		).toBeInTheDocument();
		expect(screen.getByText('21 Tage')).toBeInTheDocument();
		expect(await screen.findByText('Noch keine Projekte für diesen Kunden')).toBeInTheDocument();
		expect(sent).toMatchObject({
			name: 'Malerbetrieb Sander (Beispiel)',
			number: null,
			street: null,
			postalCode: '44787',
			city: 'Bochum',
			countryCode: 'DE',
			isBusiness: true,
			invoiceLocale: 'de',
			paymentTermsDays: 21,
			roundingIncrementMin: null,
			roundingMode: null
		});
	});

	it('explains a country code that is not two letters', async () => {
		signInForBilling();
		renderApp('/billing/clients');
		await clientsTable();
		await userEvent.click(screen.getByRole('button', { name: 'Kunde anlegen' }));

		const form = screen.getByRole('form', { name: 'Kunde anlegen' });
		await userEvent.type(within(form).getByLabelText('Name'), 'Kaffeerösterei Vos (Beispiel)');
		const country = within(form).getByLabelText('Land');
		await userEvent.clear(country);
		await userEvent.type(country, 'N1');
		await userEvent.click(within(form).getByRole('button', { name: 'Kunde anlegen' }));

		expect(await within(form).findByText('Zwei Buchstaben, etwa DE')).toBeInTheDocument();
	});

	it('archives a client after asking', async () => {
		signInForBilling();
		renderApp('/billing/clients');
		const table = await clientsTable();

		await userEvent.click(
			within(rowOf(table, 'Elektro Kaya (Beispiel)')).getByRole('button', {
				name: 'Elektro Kaya (Beispiel) archivieren'
			})
		);
		const dialog = screen.getByRole('alertdialog', { name: 'Elektro Kaya (Beispiel) archivieren' });
		await userEvent.click(within(dialog).getByRole('button', { name: 'Archivieren' }));

		await waitFor(() =>
			expect(within(table).queryByText('Elektro Kaya (Beispiel)')).not.toBeInTheDocument()
		);
	});

	it('offers deleting to the administration only', async () => {
		signInForBilling('company', 'hr');
		renderApp('/billing/clients');
		const table = await clientsTable();
		expect(within(table).queryByRole('button', { name: /löschen/ })).not.toBeInTheDocument();
		expect(within(table).getAllByRole('button', { name: /archivieren/ }).length).toBeGreaterThan(0);
	});

	it('asks for the sign-in again before deleting', async () => {
		signInForBilling();
		server.use(
			http.delete(
				'/api/clients/:id',
				() =>
					HttpResponse.json(
						{ code: 'REAUTH_REQUIRED', message: 'Step-up needed', details: null },
						{ status: 403 }
					),
				{ once: true }
			),
			http.post('/api/auth/reauth', () =>
				HttpResponse.json({ reauthUntil: '2026-09-25T12:10:00+02:00' })
			)
		);
		renderApp('/billing/clients');
		const table = await clientsTable();

		await userEvent.click(
			within(rowOf(table, 'Elektro Kaya (Beispiel)')).getByRole('button', {
				name: 'Elektro Kaya (Beispiel) löschen?'
			})
		);
		const dialog = screen.getByRole('alertdialog', { name: 'Elektro Kaya (Beispiel) löschen?' });
		await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));

		const reauth = await screen.findByRole('dialog', { name: 'Erneut bestätigen' });
		await userEvent.type(within(reauth).getByLabelText('Passwort'), 'richtiges-passwort');
		await userEvent.type(within(reauth).getByLabelText('Code aus der Authenticator-App'), '123456');
		await userEvent.click(within(reauth).getByRole('button', { name: 'Bestätigen' }));

		await waitFor(() =>
			expect(within(table).queryByText('Elektro Kaya (Beispiel)')).not.toBeInTheDocument()
		);
	});

	it('starts a fresh solo workspace with its first client', async () => {
		signInForBilling('solo-empty');
		renderApp('/billing/clients');

		expect(await screen.findByText('Noch keine Kunden')).toBeInTheDocument();
		expect(screen.getByText('Noch kein Standardsatz')).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Ersten Kunden anlegen' }));
		expect(screen.getByRole('form', { name: 'Kunde anlegen' })).toBeInTheDocument();
	});
});
