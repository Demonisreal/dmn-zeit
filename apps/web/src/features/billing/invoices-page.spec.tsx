import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InvoiceSummary } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { invoiceIds, signInForBilling } from './testing';

const invoicesTable = () => screen.findByRole('table', { name: 'Rechnungen' });
const rowOf = (table: HTMLElement, name: string | RegExp) =>
	within(table).getByText(name).closest('tr')!;

describe('invoices', () => {
	it('lists invoices and marks an overdue one', async () => {
		signInForBilling();
		renderApp('/billing');
		const table = await invoicesTable();

		const overdue = rowOf(table, /RE-\d{4}-0001/);
		const [underNumber, clientCell] = within(overdue).getAllByText(
			'Autohaus Brinkmann KG (Beispiel)'
		);
		expect(underNumber!.closest('td')).toHaveTextContent(/^RE-\d{4}-0001Autohaus/);
		expect(clientCell).toHaveAttribute('data-priority', 'mid');
		expect(within(overdue).getByText('ausgestellt')).toBeInTheDocument();
		expect(within(overdue).getByText('überfällig')).toBeInTheDocument();

		const draft = within(table).getAllByText('Entwurf')[0]!.closest('tr')!;
		expect(within(draft).getAllByText('Praxis Dr. Yilmaz (Beispiel)')).toHaveLength(2);
	});

	it('links the PDF of every issued invoice, named after its number', async () => {
		signInForBilling();
		renderApp('/billing');
		const table = await invoicesTable();

		const issued = rowOf(table, /RE-\d{4}-0002/);
		const number = within(issued).getByRole('link', { name: /^RE-/ }).textContent!;
		const pdf = within(issued).getByRole('link', { name: `PDF herunterladen, ${number}` });
		expect(pdf).toHaveTextContent('PDF');
		expect(pdf).toHaveAttribute('href', `/api/invoices/${invoiceIds.hagenIssued}/document`);
		expect(pdf).toHaveAttribute('download');

		const draft = within(table).getAllByText('Entwurf')[0]!.closest('tr')!;
		expect(within(draft).queryByRole('link', { name: /herunterladen/ })).not.toBeInTheDocument();
	});

	it('adds the XML next to the PDF for an XRechnung, and only there', async () => {
		signInForBilling();
		const listed = await fetch('/api/invoices').then((res) => res.json());
		server.use(
			http.get('/api/invoices', () =>
				HttpResponse.json({
					...listed,
					items: listed.items.map((invoice: InvoiceSummary) =>
						invoice.id === invoiceIds.hagenIssued ? { ...invoice, format: 'xrechnung' } : invoice
					)
				})
			)
		);
		renderApp('/billing');
		const table = await invoicesTable();

		const xrechnung = rowOf(table, /RE-\d{4}-0002/);
		const number = within(xrechnung).getByRole('link', { name: /^RE-/ }).textContent!;
		const xml = within(xrechnung).getByRole('link', { name: `XML herunterladen, ${number}` });
		expect(xml).toHaveTextContent('XML');
		expect(xml).toHaveAttribute('href', `/api/invoices/${invoiceIds.hagenIssued}/xml`);
		expect(xml).toHaveAttribute('download');
		expect(
			within(xrechnung).getByRole('link', { name: `PDF herunterladen, ${number}` })
		).toBeInTheDocument();

		const pdfOnly = rowOf(table, /RE-\d{4}-0001/);
		expect(
			within(pdfOnly).queryByRole('link', { name: /^XML herunterladen/ })
		).not.toBeInTheDocument();
	});

	it('filters by status', async () => {
		signInForBilling();
		renderApp('/billing');
		await invoicesTable();

		await userEvent.click(screen.getByRole('button', { name: /Status/ }));
		await userEvent.click(screen.getByRole('option', { name: 'bezahlt' }));

		expect(await screen.findByText('Keine Rechnung passt zu den Filtern.')).toBeInTheDocument();
	});

	it('offers the settings entry only to the administration', async () => {
		signInForBilling('company', 'hr');
		renderApp('/billing');
		await invoicesTable();
		expect(screen.queryByRole('link', { name: 'Einstellungen' })).not.toBeInTheDocument();
	});

	it('starts a fresh solo workspace with no invoices yet', async () => {
		signInForBilling('solo-empty');
		renderApp('/billing');

		expect(await screen.findByText('Noch keine Rechnungen')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Neue Rechnung' })).toBeInTheDocument();
	});
});
