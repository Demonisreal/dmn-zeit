import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { signInForWeek } from '../week/testing';

// Katrin Hölscher in the week mock, used whenever a test needs somebody else's month
const katrinId = 'bb3deb4b-00e1-4c28-a4d6-de86c556bb22';

const monthTable = (month: string) => screen.findByRole('table', { name: `Buchungen ${month}` });

async function openDay(date: RegExp, id: string) {
	const table = await monthTable('September 2026');
	await userEvent.click(within(table).getByRole('button', { name: date }));
	return document.getElementById(id)!;
}

describe('month', () => {
	afterEach(() => vi.useRealTimers());

	it('shows every day of september with the sums of the month', async () => {
		signInForWeek();
		renderApp('/time');
		const table = await monthTable('September 2026');

		expect(within(table).getAllByRole('button', { name: /\.09\./ })).toHaveLength(30);
		const sums = within(table).getByRole('rowheader', { name: 'Monat' }).closest('tr')!;
		expect(within(sums).getByText('bis jetzt')).toBeInTheDocument();
		const balance = within(table).getByRole('rowheader', { name: 'Gleitzeitsaldo' }).closest('tr')!;
		expect(await within(balance).findByText(/\+12:35 h/)).toBeInTheDocument();

		await userEvent.click(screen.getByRole('button', { name: 'Vorheriger Monat' }));
		expect(await monthTable('August 2026')).toBeInTheDocument();
	});

	it('lets a team lead acknowledge an open finding in the row', async () => {
		signInForWeek('team_lead');
		const sent: unknown[] = [];
		server.use(
			http.post('/api/compliance/findings/ack', async ({ request }) => {
				sent.push(await request.clone().json());
				return undefined;
			})
		);
		renderApp(`/time?employee=${katrinId}`);
		const detail = await openDay(/22\.09\./, 'day-2026-09-22');
		const finding = within(detail)
			.getByText(/Pause zu kurz/)
			.closest('li')!;

		await userEvent.click(within(finding).getByRole('button', { name: 'Quittieren' }));
		await userEvent.type(
			within(finding).getByLabelText('Notiz'),
			'Mit der Beschäftigten besprochen, Pausen werden künftig eingehalten.'
		);
		await userEvent.click(within(finding).getByRole('button', { name: 'Befund quittieren' }));

		expect(
			await within(detail).findByText(/Quittiert von Mara Lenz am 24\.09\.2026/)
		).toBeInTheDocument();
		expect(within(detail).queryByRole('button', { name: 'Befund quittieren' })).toBeNull();
		expect(sent).toEqual([
			{
				employeeId: katrinId,
				date: '2026-09-22',
				code: 'ARBZG_4_BREAK_SHORT',
				ruleVersion: 'arbzg-1994',
				note: 'Mit der Beschäftigten besprochen, Pausen werden künftig eingehalten.'
			}
		]);
	});

	it('offers no acknowledge button on the team lead’s own month', async () => {
		signInForWeek('team_lead');
		renderApp('/time');
		const detail = await openDay(/22\.09\./, 'day-2026-09-22');

		expect(within(detail).queryByRole('button', { name: 'Quittieren' })).not.toBeInTheDocument();
	});

	it('offers a team lead no absence request on someone else’s day', async () => {
		signInForWeek('team_lead');
		renderApp(`/time?employee=${katrinId}`);
		const detail = await openDay(/25\.09\./, 'day-2026-09-25');

		expect(within(detail).getByRole('heading', { name: 'Rechnung' })).toBeInTheDocument();
		expect(within(detail).queryByRole('link', { name: 'Abwesenheit beantragen' })).toBeNull();
	});

	it('stops the flextime derivation at the month shown', async () => {
		signInForWeek();
		renderApp('/time?month=2026-08');
		const table = await monthTable('August 2026');
		const toggle = within(table).getByRole('button', { name: 'Gleitzeitsaldo' });

		await userEvent.click(toggle);

		const derivation = document.getElementById('flex-detail')!;
		expect(within(derivation).getByText('Januar bis August')).toBeInTheDocument();
		expect(
			within(derivation).getByText('Saldo', { selector: 'dt' }).nextElementSibling
		).toHaveTextContent('+11:45 h');
		const months = within(derivation).getByRole('table', { name: 'Monatswerte' });
		expect(within(months).queryByRole('row', { name: /^September 2026/ })).toBeNull();
	});

	it('asks for a note before acknowledging', async () => {
		signInForWeek('hr');
		let sent = false;
		server.use(
			http.post('/api/compliance/findings/ack', () => {
				sent = true;
				return undefined;
			})
		);
		renderApp(`/time?employee=${katrinId}`);
		const detail = await openDay(/22\.09\./, 'day-2026-09-22');
		const finding = within(detail)
			.getByText(/Pause zu kurz/)
			.closest('li')!;

		await userEvent.click(within(finding).getByRole('button', { name: 'Quittieren' }));
		await userEvent.click(within(finding).getByRole('button', { name: 'Befund quittieren' }));

		// the wording of the empty-text check lives in common.json
		await waitFor(() =>
			expect(within(finding).getByLabelText('Notiz')).toHaveAttribute('aria-invalid', 'true')
		);
		expect(sent).toBe(false);
	});

	it('offers a retry when the month of a team member cannot be loaded', async () => {
		signInForWeek('team_lead');
		server.use(
			http.get(
				'/api/employees/:id/days',
				() =>
					HttpResponse.json(
						{ code: 'FORBIDDEN', message: 'Not in your team', details: null },
						{ status: 403 }
					),
				{ once: true }
			)
		);
		renderApp(`/time?employee=${katrinId}`);

		expect(await screen.findByRole('alert')).toHaveTextContent('Das hat nicht geklappt.');
		await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

		expect(await monthTable('September 2026')).toBeInTheDocument();
	});

	it('shows employees who acknowledged a finding but offers no button', async () => {
		signInForWeek('employee');
		renderApp('/time');
		const detail = await openDay(/20\.09\./, 'day-2026-09-20');

		expect(
			within(detail).getByText(/Quittiert von Katrin Hölscher am 21\.09\.2026/)
		).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Quittieren' })).not.toBeInTheDocument();
	});
});
