import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { signInForWeek } from './testing';

const weekTable = (week: number) => screen.findByRole('table', { name: `Buchungen KW ${week}` });

const rowOf = (table: HTMLElement, date: RegExp) =>
	within(table).getByRole('button', { name: date }).closest('tr')!;

describe('week', () => {
	beforeEach(() => signInForWeek());
	afterEach(() => vi.useRealTimers());

	it('lists week 39 with today marked and the sums below', async () => {
		renderApp('/');
		const table = await weekTable(39);

		expect(screen.getByText('KW 39')).toBeInTheDocument();
		expect(screen.getByText('21.09. bis 27.09.2026')).toBeInTheDocument();
		expect(rowOf(table, /24\.09\./)).toHaveAttribute('data-current');
		expect(rowOf(table, /23\.09\./)).not.toHaveAttribute('data-current');

		const tuesday = rowOf(table, /22\.09\./);
		expect(within(tuesday).getByText('9:30 h')).toBeInTheDocument();
		expect(within(tuesday).getByText('+1:42 h')).toBeInTheDocument();
		expect(within(tuesday).getByText('§ 4')).toBeInTheDocument();

		const sums = within(table).getByRole('rowheader', { name: 'Woche' }).closest('tr')!;
		expect(within(sums).getByText('29:26 h')).toBeInTheDocument();
		expect(within(sums).getByText('39:00 h')).toBeInTheDocument();
		expect(within(sums).getByText(/−1:46 h/)).toBeInTheDocument();
		expect(within(sums).getByText('bis heute')).toBeInTheDocument();

		const balance = within(table).getByRole('rowheader', { name: 'Gleitzeitsaldo' }).closest('tr')!;
		expect(await within(balance).findByText(/\+12:35 h/)).toBeInTheDocument();
		expect(within(balance).getByText('Stand 24.09.2026')).toBeInTheDocument();

		expect(await screen.findByText('1 Korrekturantrag')).toBeInTheDocument();
		expect(await screen.findByText('11,00')).toBeInTheDocument();
		expect(screen.getByText('3,00 Tage beantragt, noch nicht genehmigt')).toBeInTheDocument();
	});

	it('marks a shift that runs past 22:00 and reads it out', async () => {
		renderApp('/');
		const table = await weekTable(39);

		expect(
			within(rowOf(table, /23\.09\./)).getByRole('img', {
				name: 'Buchungen: 09:05 bis 13:10, 13:55 bis 17:20 und 20:15 bis 22:40'
			})
		).toBeInTheDocument();
	});

	it('opens the breakdown from the worked time and closes it again', async () => {
		renderApp('/');
		const table = await weekTable(39);
		const toggle = within(table).getByRole('button', { name: /22\.09\./ });

		await userEvent.click(within(rowOf(table, /22\.09\./)).getByText('9:30 h'));

		expect(toggle).toHaveAttribute('aria-expanded', 'true');
		const detail = document.getElementById('day-2026-09-22')!;
		expect(within(detail).getByText('07:30 bis 12:00')).toBeInTheDocument();
		expect(within(detail).getByText('12:00 bis 12:30')).toBeInTheDocument();
		expect(within(detail).getByText('Dienstag: 7:48 h laut Vertrag')).toBeInTheDocument();
		expect(within(detail).getByText('+1:42 h')).toBeInTheDocument();
		expect(
			within(detail).getByText('Pause zu kurz: 0:45 h vorgeschrieben, 0:30 h gemacht.', {
				exact: false
			})
		).toBeInTheDocument();
		expect(within(detail).getByText('§ 4 ArbZG')).toBeInTheDocument();

		await userEvent.click(toggle);

		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		expect(document.getElementById('day-2026-09-22')).toBeNull();
	});

	it('opens a day with the keyboard and shows a vacation credit', async () => {
		renderApp('/');
		await weekTable(39);

		await userEvent.click(screen.getByRole('button', { name: 'Vorherige Woche' }));
		const friday = await screen.findByRole('button', { name: /18\.09\./ });
		friday.focus();
		await userEvent.keyboard('{Enter}');

		expect(friday).toHaveAttribute('aria-expanded', 'true');
		const detail = document.getElementById('day-2026-09-18')!;
		expect(within(detail).getByText('Gutschrift')).toBeInTheDocument();
		expect(within(detail).getByText('Abwesenheit: Urlaub, genehmigt')).toBeInTheDocument();
	});

	it('pages through the weeks with the arrows and back to this week', async () => {
		renderApp('/');
		await weekTable(39);
		const previous = screen.getByRole('button', { name: 'Vorherige Woche' });

		await userEvent.click(previous);
		expect(await weekTable(38)).toBeInTheDocument();
		expect(await screen.findByRole('button', { name: /14\.09\./ })).toBeInTheDocument();

		await userEvent.keyboard('{ArrowLeft}');
		expect(await weekTable(37)).toBeInTheDocument();

		await userEvent.click(screen.getByRole('button', { name: 'Diese Woche' }));
		expect(await weekTable(39)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Diese Woche' })).not.toBeInTheDocument();
	});

	it('offers a retry when the week does not load', async () => {
		server.use(
			http.get(
				'/api/employees/:id/days',
				() =>
					HttpResponse.json(
						{ code: 'NOT_FOUND', message: 'Employee not found', details: null },
						{ status: 404 }
					),
				{ once: true }
			)
		);
		renderApp('/');

		expect(await screen.findByRole('alert')).toHaveTextContent('Das hat nicht geklappt.');

		await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

		expect(await weekTable(39)).toBeInTheDocument();
	});

	it('explains why an account without employee record has no week', async () => {
		signInForWeek('admin', null);
		renderApp('/');

		expect(
			await screen.findByText('Zu diesem Konto gibt es keinen Personalstamm')
		).toBeInTheDocument();
		expect(screen.queryByRole('group', { name: 'Stempeln' })).not.toBeInTheDocument();
	});
});
