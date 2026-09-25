import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VacationAccount } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { signInAs } from '../absences/test-session';

const cells = (row: HTMLElement) =>
	within(row)
		.getAllByRole('cell')
		.map((cell) => cell.textContent);

describe('leave account', () => {
	beforeEach(() => signInAs('employee'));
	afterEach(() => vi.useRealTimers());

	it('shows every bucket and derives the current one entry by entry', async () => {
		renderApp('/vacation');
		const account = await screen.findByRole('table', { name: 'Urlaubskonto 2026' });

		const current = within(account).getByRole('row', { name: /^2026/ });
		expect(cells(current)).toEqual([
			'30,00',
			'17,00',
			'1,00',
			'0,00',
			'0,00',
			'14,00',
			'31.03.2027'
		]);
		expect(within(account).getByRole('row', { name: /^2025 Übertrag/ })).toBeInTheDocument();
		expect(
			within(account).getByText('abzüglich 3,00 Tage in offenen Anträgen')
		).toBeInTheDocument();

		expect(screen.getByText('Anspruch 2026: 30,00 Tage')).toBeInTheDocument();
		expect(screen.getByText('Voller Jahresanspruch laut Vertrag: 30,00 Tage')).toBeInTheDocument();
		const ledger = screen.getByRole('table', { name: 'Buchungen im Anspruchsjahr 2026' });
		const entries = within(ledger).getAllByRole('row').slice(1);
		expect(entries.map((entry) => cells(entry).slice(1, 4))).toEqual([
			['Anspruch', '+30,00', '30,00'],
			['Urlaub genehmigt', '-4,00', '26,00'],
			['Urlaub genehmigt', '-10,00', '16,00'],
			['Rückbuchung Krankheit', '+1,00', '17,00'],
			['Urlaub genehmigt', '-3,00', '14,00']
		]);
	});

	it('opens the carry-over with its forfeiture', async () => {
		renderApp('/vacation');
		await screen.findByRole('table', { name: 'Urlaubskonto 2026' });

		const toggle = screen.getByRole('button', { name: '2025 Übertrag Herleitung' });
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await userEvent.click(toggle);

		expect(toggle).toHaveAttribute('aria-expanded', 'true');
		const ledger = screen.getByRole('table', { name: 'Buchungen im Anspruchsjahr 2025' });
		expect(within(ledger).getByRole('row', { name: /Verfall/ })).toHaveTextContent(
			'nach Hinweis vom 06.10.2025'
		);
		expect(
			screen.getByText(/Nach Hinweis mit Ablauf des 31\.03\.2026 verfallen/)
		).toHaveTextContent('quittiert am 07.10.2025');
	});

	it('acknowledges the forfeiture notice', async () => {
		renderApp('/vacation');
		expect(
			await screen.findByText(
				'Resturlaub aus 2026: 14,00 Tage. Was bis zum 31.03.2027 nicht genommen ist, verfällt (§ 7 Abs. 3 BUrlG).'
			)
		).toBeInTheDocument();
		expect(screen.getByText(/vom 15\.09\.2026, noch nicht quittiert/)).toBeInTheDocument();

		await userEvent.click(screen.getByRole('button', { name: 'Hinweis quittieren' }));

		expect(await screen.findByText('Hinweis zum Urlaubsverfall quittiert.')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Hinweis quittieren' })).not.toBeInTheDocument();
		expect(
			await screen.findByText(/vom 15\.09\.2026, quittiert am 24\.09\.2026/)
		).toBeInTheDocument();
	});

	it('explains a waiting period that is still running', async () => {
		const account: VacationAccount = {
			employeeId: '8d41b7c2-0e5f-4a93-b6d8-2c7e9f13a054',
			year: 2026,
			entitlement: {
				days: '10.00',
				explanations: [
					{ key: 'vacation.entitlement.pro_rata', params: { months: 4, days: '10.00' } },
					{ key: 'vacation.entitlement.waiting_period', params: { until: '2027-02-28' } }
				]
			},
			buckets: [
				{
					year: 2026,
					entitlement: '10.00',
					taken: '0.00',
					refunded: '0.00',
					adjusted: '0.00',
					expired: '0.00',
					remaining: '10.00',
					deadline: '2027-03-31',
					notice: null,
					expiry: {
						decision: 'not_due',
						explanation: { key: 'vacation.expiry.not_due', params: {} }
					}
				}
			],
			pending: '0.00',
			available: '10.00',
			ledger: []
		};
		server.use(http.get('/api/employees/:id/vacation', () => HttpResponse.json(account)));
		renderApp('/vacation');

		expect(
			await screen.findByText('Anteilig für 4 Monate: 10,00 Tage (§ 5 Abs. 1 BUrlG)')
		).toBeInTheDocument();
		expect(
			screen.getByText(
				'Wartezeit nach § 4 BUrlG bis einschließlich 28.02.2027, der volle Anspruch entsteht erst danach'
			)
		).toBeInTheDocument();
		expect(screen.getByText(/Kein Hinweis zum Urlaubsverfall erteilt/)).toBeInTheDocument();

		await act(() => i18n.changeLanguage('en'));
		expect(
			screen.getByText(
				'Waiting period under § 4 BUrlG until 28/02/2027 inclusive, the full entitlement only arises afterwards'
			)
		).toBeInTheDocument();
	});

	it('offers a retry when the account cannot be loaded', async () => {
		server.use(
			http.get(
				'/api/employees/:id/vacation',
				() =>
					HttpResponse.json({ code: 'FORBIDDEN', message: 'No', details: null }, { status: 403 }),
				{ once: true }
			)
		);
		renderApp('/vacation');

		expect(await screen.findByRole('alert')).toHaveTextContent('Das hat nicht geklappt.');
		await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

		expect(await screen.findByRole('table', { name: 'Urlaubskonto 2026' })).toBeInTheDocument();
	});

	it('steps through the years', async () => {
		renderApp('/vacation');
		await screen.findByRole('table', { name: 'Urlaubskonto 2026' });

		await userEvent.click(screen.getByRole('button', { name: 'Vorheriges Jahr' }));
		const earlier = await screen.findByRole('table', { name: 'Urlaubskonto 2025' });
		expect(within(earlier).queryByText('Übertrag')).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole('button', { name: 'Nächstes Jahr' }));
		await userEvent.click(screen.getByRole('button', { name: 'Nächstes Jahr' }));
		expect(await screen.findByText('Für 2027 gibt es kein Urlaubskonto.')).toBeInTheDocument();
	});
});
