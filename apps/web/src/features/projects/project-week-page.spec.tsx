import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/render-app';
import { signInForProjects } from './mocks-support';

const matrix = () => screen.findByRole('table', { name: 'Projektzeit KW 39' });

const rowOf = (table: HTMLElement, name: string) =>
	within(table).getByRole('rowheader', { name }).closest('tr')!;

describe('project week', () => {
	afterEach(() => vi.useRealTimers());

	it('opens the breakdown of a cell with entries, rounding, rate and amount', async () => {
		signInForProjects();
		renderApp('/projects');
		const table = await matrix();

		const payroll = rowOf(table, 'Lohnabrechnung');
		const cell = within(payroll).getByRole('button', { name: '1:30 h, Herleitung' });
		await userEvent.click(cell);

		expect(cell).toHaveAttribute('aria-expanded', 'true');
		const detail = document.getElementById(cell.getAttribute('aria-controls')!)!;
		expect(within(detail).getByText('18:00 bis 19:30')).toBeInTheDocument();
		expect(
			within(detail).getByText('Rundungsraster 15 min, kaufmännisch gerundet: 1:30 h ergibt 1:30 h')
		).toBeInTheDocument();
		expect(within(detail).getByText('Standardsatz, gültig ab 01.01.2026')).toBeInTheDocument();
		expect(within(detail).getAllByText('135,00 €').length).toBeGreaterThan(0);

		await userEvent.click(cell);
		expect(cell).toHaveAttribute('aria-expanded', 'false');
	});

	it('shows the reconciliation with the clock and its hints', async () => {
		signInForProjects();
		renderApp('/projects');
		const table = await matrix();

		const hints = rowOf(table, 'Abgleich');
		const cells = within(hints).getAllByRole('cell');
		// monday: a call during the stamped lunch break, tuesday: an evening after clocking out
		expect(within(cells[0]!).getByText('außerhalb')).toBeInTheDocument();
		expect(within(cells[0]!).queryByText('mehr als Ist')).not.toBeInTheDocument();
		expect(within(cells[1]!).getByText('mehr als Ist')).toBeInTheDocument();
		expect(
			within(cells[0]!).getByText(', Projektzeit außerhalb der gestempelten Arbeitszeit')
		).toBeInTheDocument();

		expect(
			within(rowOf(table, 'außerhalb der Arbeitszeit')).getByText('0:25 h')
		).toBeInTheDocument();
		expect(
			screen.getByText(/nur als Hinweis: kein Befund nach dem Arbeitszeitgesetz/)
		).toBeInTheDocument();
	});

	it('leaves amounts out for an employee', async () => {
		signInForProjects('company', 'employee');
		renderApp('/projects');
		const table = await matrix();

		expect(within(table).queryByRole('columnheader', { name: 'Betrag' })).not.toBeInTheDocument();
		expect(screen.queryByRole('heading', { name: 'Budgets' })).not.toBeInTheDocument();
	});

	it('is the start page of a solo workspace, without clock and reconciliation', async () => {
		signInForProjects('solo');
		renderApp('/');
		const table = await matrix();

		expect(screen.queryByRole('group', { name: 'Stempeln' })).not.toBeInTheDocument();
		expect(within(table).queryByRole('rowheader', { name: 'Abgleich' })).not.toBeInTheDocument();
		const nav = within(screen.getByRole('navigation', { name: 'Hauptnavigation' }));
		expect(nav.getByRole('link', { name: 'Woche' })).toBeInTheDocument();
		expect(nav.queryByRole('link', { name: 'Monat' })).not.toBeInTheDocument();
		expect(nav.queryByRole('link', { name: 'Projektzeit' })).not.toBeInTheDocument();

		expect(
			(await screen.findAllByText('Budget überschritten', { exact: false })).length
		).toBeGreaterThan(0);
		expect(screen.getByRole('heading', { name: 'Nicht abgerechnet' })).toBeInTheDocument();
	});

	it('sends a solo workspace from /projects to the start page', async () => {
		signInForProjects('solo');
		const router = renderApp('/projects');
		await matrix();

		expect(router.state.location.pathname).toBe('/');
	});

	it('explains the first start without clients', async () => {
		signInForProjects('solo-empty');
		renderApp('/');

		expect(await screen.findByText('Noch keine Kunden und Projekte')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Ersten Kunden anlegen' })).toHaveAttribute(
			'href',
			'/billing/clients'
		);
		expect(screen.queryByRole('group', { name: 'Projekt-Timer' })).not.toBeInTheDocument();
	});

	it('lets a narrow screen pick the day it shows, starting with today', async () => {
		signInForProjects();
		renderApp('/projects');
		const table = await matrix();

		const days = screen.getByRole('radiogroup', { name: 'Tag' });
		expect(within(days).getAllByRole('radio')).toHaveLength(7);
		expect(within(days).getByRole('radio', { name: /^Donnerstag, 24\. September/ })).toBeChecked();
		const thursday = within(table).getByRole('columnheader', { name: /Do\.?\s*24\.09\./ });
		const monday = within(table).getByRole('columnheader', { name: /Mo\.?\s*21\.09\./ });
		expect(thursday).not.toHaveAttribute('data-priority');
		expect(monday).toHaveAttribute('data-priority', 'mid');

		await userEvent.click(within(days).getByRole('radio', { name: /^Montag, 21\. September/ }));
		expect(monday).not.toHaveAttribute('data-priority');
		expect(thursday).toHaveAttribute('data-priority', 'mid');

		await userEvent.click(screen.getByRole('button', { name: 'Vorherige Woche' }));
		expect(
			await within(days).findByRole('radio', { name: /^Montag, 14\. September/ })
		).toBeChecked();
	});

	it('names the lock of invoiced cells and shows no amount for unbillable time', async () => {
		signInForProjects();
		renderApp('/projects?week=2026-08-31');
		const table = await screen.findByRole('table', { name: 'Projektzeit KW 36' });

		expect(screen.getByText('Gesperrt:')).toHaveTextContent(/^Gesperrt:abgerechnet$/);
		expect(
			within(table).getAllByRole('button', { name: /, abgerechnet, Herleitung$/ }).length
		).toBeGreaterThan(0);

		const firstTalk = rowOf(table, 'Erstgespräch Betriebsübergabe');
		expect(within(firstTalk).queryByText('0,00 €')).not.toBeInTheDocument();
		expect(within(firstTalk).getByTitle('nicht abrechenbar')).toBeInTheDocument();
	});

	it('leads from unbilled time straight to a new invoice for the client', async () => {
		signInForProjects();
		renderApp('/projects');
		await matrix();

		const unbilled = screen.getByRole('region', { name: 'Nicht abgerechnet' });
		const [link] = within(unbilled).getAllByRole('link', { name: /^Rechnung für .+ erstellen$/ });
		expect(link).toHaveAttribute(
			'href',
			expect.stringMatching(/^\/billing\/invoices\/new\?client=/)
		);
	});
});
