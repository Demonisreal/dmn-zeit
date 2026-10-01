import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { invoiceIds, signInForBilling } from './testing';

describe('invoice editor', () => {
	it('shows the draft with an empty position list', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		expect(await screen.findByRole('heading', { name: 'Praxis Dr. Yilmaz (Beispiel)' })).toBeInTheDocument();
		expect(screen.getByText('Noch keine Positionen für diesen Zeitraum.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Ausstellen' })).toBeDisabled();
	});

	it('adds a free position and totals it into the issue confirmation', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);
		await screen.findByRole('heading', { name: 'Praxis Dr. Yilmaz (Beispiel)' });

		await userEvent.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
		const form = screen.getByRole('form', { name: 'Position hinzufügen' });
		await userEvent.type(within(form).getByLabelText('Beschreibung'), 'Hosting-Pauschale');
		await userEvent.clear(within(form).getByLabelText('Menge'));
		await userEvent.type(within(form).getByLabelText('Menge'), '2');
		await userEvent.type(within(form).getByLabelText('Einzelpreis'), '50');
		await userEvent.click(within(form).getByRole('button', { name: 'Position hinzufügen' }));

		expect(await screen.findByText('Hosting-Pauschale')).toBeInTheDocument();
		expect(screen.getByText('100,00 €')).toBeInTheDocument();

		const issueButton = screen.getByRole('button', { name: 'Ausstellen' });
		expect(issueButton).not.toBeDisabled();
		await userEvent.click(issueButton);

		const dialog = await screen.findByRole('alertdialog', { name: 'Rechnung ausstellen' });
		expect(within(dialog).getByText('119,00 €')).toBeInTheDocument();
		expect(within(dialog).getByText('Die Rechnung erhält jetzt eine Nummer und kann danach nicht mehr geändert werden.')).toBeInTheDocument();
		expect(within(dialog).getByRole('radio', { name: 'ZUGFeRD' })).toBeDisabled();
	});

	it('blocks issuing while the billing profile is missing required data', async () => {
		signInForBilling();
		const raw = await fetch(`/api/invoices/${invoiceIds.yilmazDraft}`).then((res) => res.json());
		server.use(
			http.get(`/api/invoices/${invoiceIds.yilmazDraft}`, () =>
				HttpResponse.json({ ...raw, blockers: ['tax_number_missing'] })
			)
		);
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		expect(
			await screen.findByText('In den Rechnungsangaben des Rechnungsstellers fehlt die Steuernummer.')
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Ausstellen' })).toBeDisabled();
	});

	it('discards a draft and returns to the invoice list', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);
		await screen.findByRole('heading', { name: 'Praxis Dr. Yilmaz (Beispiel)' });

		await userEvent.click(screen.getByRole('button', { name: 'Entwurf verwerfen' }));
		const dialog = await screen.findByRole('alertdialog');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Entwurf verwerfen' }));

		expect(await screen.findByRole('table', { name: 'Rechnungen' })).toBeInTheDocument();
	});
});
