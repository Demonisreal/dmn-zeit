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
		expect(within(sums).getByText('bis jetzt')).toBeInTheDocument();

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
		expect(
			within(detail).getByText('Dienstag: 7:48 h laut Vertrag, gültig ab 01.02.2021')
		).toBeInTheDocument();
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

	it('offers to request an absence for a coming workday', async () => {
		renderApp('/');
		const table = await weekTable(39);

		await userEvent.click(within(table).getByRole('button', { name: /25\.09\./ }));

		const detail = document.getElementById('day-2026-09-25')!;
		expect(within(detail).getByRole('link', { name: 'Abwesenheit beantragen' })).toHaveAttribute(
			'href',
			'/absences?start=2026-09-25'
		);
	});

	it('offers no absence request on the weekend', async () => {
		renderApp('/');
		const table = await weekTable(39);

		await userEvent.click(within(table).getByRole('button', { name: /26\.09\./ }));

		const detail = document.getElementById('day-2026-09-26')!;
		expect(within(detail).queryByRole('link', { name: 'Abwesenheit beantragen' })).toBeNull();
	});

	it('offers no absence request for a day that is over', async () => {
		renderApp('/');
		const table = await weekTable(39);

		await userEvent.click(within(table).getByRole('button', { name: /23\.09\./ }));

		const detail = document.getElementById('day-2026-09-23')!;
		expect(within(detail).queryByRole('link', { name: 'Abwesenheit beantragen' })).toBeNull();
	});

	it('shows leave already booked instead of offering a request', async () => {
		renderApp('/?week=2026-12-21');
		const table = await weekTable(52);

		await userEvent.click(within(table).getByRole('button', { name: /22\.12\./ }));

		const detail = document.getElementById('day-2026-12-22')!;
		expect(within(detail).getByText('Abwesenheit: Urlaub, genehmigt')).toBeInTheDocument();
		expect(within(detail).queryByRole('link', { name: 'Abwesenheit beantragen' })).toBeNull();
	});

	it('ticks the rest period step of the demo tour once that day is opened', async () => {
		sessionStorage.clear();
		signInForWeek('employee', undefined, 'demo');
		renderApp('/');
		const table = await weekTable(39);
		expect(sessionStorage.getItem('zeit.demo.restFinding')).toBeNull();

		await userEvent.click(within(table).getByRole('button', { name: /24\.09\./ }));

		const detail = document.getElementById('day-2026-09-24')!;
		expect(within(detail).getByText('§ 5 ArbZG')).toBeInTheDocument();
		expect(sessionStorage.getItem('zeit.demo.restFinding')).toBe('1');
	});

	it('spells out the flextime balance when it is opened', async () => {
		renderApp('/');
		const table = await weekTable(39);
		// the loader brings the week, the balance follows once the page asks for it
		const toggle = await within(table).findByRole('button', { name: 'Gleitzeitsaldo' });
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		expect(document.getElementById('flex-detail')).toBeNull();

		await userEvent.click(toggle);

		expect(toggle).toHaveAttribute('aria-expanded', 'true');
		const derivation = document.getElementById(toggle.getAttribute('aria-controls')!)!;
		const line = (term: string) =>
			within(derivation).getByText(term, { selector: 'dt' }).nextElementSibling;
		expect(line('Anfangssaldo')).toHaveTextContent('+8:00 h');
		expect(line('Differenzen')).toHaveTextContent('+4:35 h');
		expect(within(derivation).getByText('Januar bis September')).toBeInTheDocument();
		expect(line('Saldo')).toHaveTextContent('+12:35 h');
		const months = within(derivation).getByRole('table', { name: 'Monatswerte' });
		// header plus january through september
		expect(within(months).getAllByRole('row')).toHaveLength(10);
		const january = within(months).getByRole('row', { name: /^Januar 2026/ });
		expect(within(january).getAllByRole('cell').at(-1)).toHaveTextContent('+9:25 h');
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
		// the route loader asks before the page does, so the failure has to last until the retry
		let failing = true;
		server.use(
			http.get('/api/employees/:id/days', () =>
				failing
					? HttpResponse.json(
							{ code: 'NOT_FOUND', message: 'Employee not found', details: null },
							{ status: 404 }
						)
					: undefined
			)
		);
		renderApp('/');

		expect(await screen.findByRole('alert')).toHaveTextContent('Das hat nicht geklappt.');

		failing = false;
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
