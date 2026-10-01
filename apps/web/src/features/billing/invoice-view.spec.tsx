import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/render-app';
import { invoiceIds, signInForBilling } from './testing';

describe('invoice view', () => {
	it('shows an issued invoice with its PDF preview and payment action', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.brinkmannIssued}`);

		expect(await screen.findByText(/RE-\d{4}-0001/)).toBeInTheDocument();
		expect(screen.getByText('ausgestellt')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Als bezahlt markieren' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Zahlung zurücknehmen' })).not.toBeInTheDocument();
	});

	it('marks the invoice paid and can undo it again', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.brinkmannIssued}`);
		await screen.findByText(/RE-\d{4}-0001/);

		await userEvent.click(screen.getByRole('button', { name: 'Als bezahlt markieren' }));
		const dialog = await screen.findByRole('alertdialog');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Als bezahlt markieren' }));

		expect(await screen.findByText('bezahlt')).toBeInTheDocument();
		const undo = screen.getByRole('button', { name: 'Zahlung zurücknehmen' });

		await userEvent.click(undo);
		expect(await screen.findByText('ausgestellt')).toBeInTheDocument();
	});

	it('requires a reason of at least 10 characters before a cancellation invoice can be issued', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.brinkmannIssued}`);
		await screen.findByText(/RE-\d{4}-0001/);

		await userEvent.click(screen.getByRole('button', { name: 'Stornieren' }));
		const dialog = await screen.findByRole('alertdialog');
		const confirm = within(dialog).getByRole('button', { name: 'Stornorechnung ausstellen' });
		expect(confirm).toBeDisabled();

		await userEvent.type(within(dialog).getByLabelText('Grund'), 'Falscher Leistungszeitraum');
		expect(confirm).not.toBeDisabled();
		await userEvent.click(confirm);

		expect(await screen.findByText('storniert')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Anzeigen' })).toBeInTheDocument();
	});
});
