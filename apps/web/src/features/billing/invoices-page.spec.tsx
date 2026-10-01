import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/render-app';
import { signInForBilling } from './testing';

const invoicesTable = () => screen.findByRole('table', { name: 'Rechnungen' });
const rowOf = (table: HTMLElement, name: string | RegExp) =>
	within(table).getByText(name).closest('tr')!;

describe('invoices', () => {
	it('lists invoices and marks an overdue one', async () => {
		signInForBilling();
		renderApp('/billing');
		const table = await invoicesTable();

		const overdue = rowOf(table, /RE-\d{4}-0001/);
		expect(within(overdue).getByText('Autohaus Brinkmann KG (Beispiel)')).toBeInTheDocument();
		expect(within(overdue).getByText('ausgestellt')).toBeInTheDocument();
		expect(within(overdue).getByText('überfällig')).toBeInTheDocument();

		const draft = within(table).getAllByText('Entwurf')[0]!.closest('tr')!;
		expect(within(draft).getByText('Praxis Dr. Yilmaz (Beispiel)')).toBeInTheDocument();
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
