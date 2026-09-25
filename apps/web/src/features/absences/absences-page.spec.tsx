import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { signInAs } from './test-session';

const openForm = async () => {
	renderApp('/absences');
	await screen.findByRole('table', { name: 'Meine Anträge 2026' });
	await userEvent.click(screen.getByRole('button', { name: 'Neuer Antrag' }));
	return screen.getByRole('region', { name: 'Abwesenheit eintragen' });
};

// dd mm yyyy in each date field, the segments move on by themselves
const enterPeriod = async (start: string, end: string) => {
	await userEvent.click(screen.getByRole('spinbutton', { name: /Tag, Startdatum/ }));
	await userEvent.keyboard(start);
	await userEvent.click(screen.getByRole('spinbutton', { name: /Tag, Enddatum/ }));
	await userEvent.keyboard(end);
};

const row = (period: string) => screen.getByRole('row', { name: new RegExp(period) });

const choose = async (label: RegExp, option: string) => {
	await userEvent.click(screen.getByRole('button', { name: label }));
	await userEvent.click(await screen.findByRole('option', { name: option }));
};

describe('absences', () => {
	beforeEach(() => signInAs('employee'));
	afterEach(() => vi.useRealTimers());

	it('lists the requests of the year with their state', async () => {
		renderApp('/absences');
		const table = await screen.findByRole('table', { name: 'Meine Anträge 2026' });

		expect(within(table).getAllByRole('row')).toHaveLength(11);
		expect(within(row('28.–30.12.2026')).getByText('abgelehnt')).toBeInTheDocument();
		expect(
			within(row('28.–30.12.2026')).getByText(/in die zweite Januarwoche/)
		).toBeInTheDocument();
		expect(within(row('24.06.2026')).getByText('gemeldet')).toBeInTheDocument();
		expect(within(row('24.06.2026')).getByText('Attest bestätigt')).toBeInTheDocument();
	});

	it('shows the cost before a leave request goes out', async () => {
		const form = await openForm();
		await enterPeriod('16112026', '18112026');

		const preview = within(form).getByRole('region', { name: 'Vorschau' });
		const facts = await within(preview).findByText('Urlaubstage');
		expect(facts.nextElementSibling).toHaveTextContent('3,00');
		expect(
			within(preview).getByText('davon aus Anspruch 2026').nextElementSibling
		).toHaveTextContent('3,00');
		// 14 left, 3 more already requested for October
		expect(within(preview).getByText('Resturlaub danach').nextElementSibling).toHaveTextContent(
			'8,00'
		);
		expect(within(preview).getByText('Sollzeit im Zeitraum').nextElementSibling).toHaveTextContent(
			'23:24 h'
		);

		await userEvent.click(within(form).getByRole('checkbox', { name: 'Letzter Tag halb' }));
		await waitFor(() =>
			expect(within(preview).getByText('Urlaubstage').nextElementSibling).toHaveTextContent('2,50')
		);

		await userEvent.click(within(form).getByRole('button', { name: 'Antrag stellen' }));

		expect(await screen.findByText(/Antrag für 16\.–18\.11\.2026 gestellt/)).toBeInTheDocument();
		expect(screen.queryByRole('region', { name: 'Abwesenheit eintragen' })).not.toBeInTheDocument();
		expect(await within(row('16.–18.11.2026')).findByText('offen')).toBeInTheDocument();
		expect(within(row('16.–18.11.2026')).getByText('letzter Tag halb')).toBeInTheDocument();
	});

	it('names the missing period and sends nothing', async () => {
		let sent = false;
		server.use(
			http.post('/api/absences', () => {
				sent = true;
				return new HttpResponse(null, { status: 201 });
			})
		);
		const form = await openForm();

		await userEvent.click(within(form).getByRole('button', { name: 'Antrag stellen' }));

		expect(await within(form).findByText('Pflichtfeld')).toBeInTheDocument();
		expect(sent).toBe(false);
	});

	it('warns about an overlap and shows the refusal of the api', async () => {
		const form = await openForm();
		await enterPeriod('13102026', '15102026');

		expect(
			await within(form).findByText('Überschneidet sich mit einem bestehenden Antrag.')
		).toBeInTheDocument();

		await userEvent.click(within(form).getByRole('button', { name: 'Antrag stellen' }));

		expect(await within(form).findByRole('alert')).toHaveTextContent(
			'Für diesen Zeitraum gibt es schon einen Antrag.'
		);
	});

	it('takes the api field errors onto the form', async () => {
		server.use(
			http.post('/api/absences', () =>
				HttpResponse.json(
					{
						code: 'VALIDATION',
						message: 'Invalid input',
						details: [{ field: 'endDate', code: 'custom', message: 'absence.endBeforeStart' }]
					},
					{ status: 400 }
				)
			)
		);
		const form = await openForm();
		await enterPeriod('16112026', '18112026');

		await userEvent.click(within(form).getByRole('button', { name: 'Antrag stellen' }));

		expect(await within(form).findByText('Das Ende liegt vor dem Beginn')).toBeInTheDocument();
		expect(within(form).getByRole('alert')).toHaveTextContent(
			'Bitte die markierten Angaben prüfen.'
		);
	});

	it('reports sick leave without an approval step', async () => {
		const form = await openForm();
		await userEvent.click(within(form).getByRole('radio', { name: 'Krankheit' }));
		expect(within(form).getByText(/braucht keine Genehmigung/)).toBeInTheDocument();
		await enterPeriod('24092026', '25092026');
		await userEvent.type(within(form).getByLabelText('Notiz'), 'Attest kommt per Post.');

		await userEvent.click(within(form).getByRole('button', { name: 'Krankmeldung abschicken' }));

		expect(await screen.findByText('Krankmeldung für 24.–25.09.2026 erfasst.')).toBeInTheDocument();
		const reported = await screen.findByRole('row', { name: /24\.–25\.09\.2026/ });
		expect(within(reported).getByText('gemeldet')).toBeInTheDocument();
		expect(within(reported).getByText('Attest offen')).toBeInTheDocument();
		expect(within(reported).queryByRole('button')).not.toBeInTheDocument();
	});

	it('withdraws a request that is still open', async () => {
		renderApp('/absences');
		await screen.findByRole('table', { name: 'Meine Anträge 2026' });

		await userEvent.click(
			within(row('12.–14.10.2026')).getByRole('button', { name: 'Zurückziehen' })
		);

		expect(await within(row('12.–14.10.2026')).findByText('zurückgezogen')).toBeInTheDocument();
		expect(within(row('12.–14.10.2026')).queryByRole('button')).not.toBeInTheDocument();
	});

	it('asks before cancelling approved leave and then waits for the team lead', async () => {
		renderApp('/absences');
		await screen.findByRole('table', { name: 'Meine Anträge 2026' });
		// past leave cannot be cancelled anymore
		expect(within(row('07.–10.04.2026')).queryByRole('button')).not.toBeInTheDocument();

		await userEvent.click(
			within(row('21.–23.12.2026')).getByRole('button', { name: 'Stornieren' })
		);
		const dialog = await screen.findByRole('alertdialog', { name: 'Antrag stornieren?' });
		expect(dialog).toHaveTextContent('Urlaub vom 21.–23.12.2026 ist genehmigt.');
		await userEvent.type(within(dialog).getByLabelText('Grund, freiwillig'), 'Doch zu Hause.');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Stornierung beantragen' }));

		await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
		expect(await within(row('21.–23.12.2026')).findByText('Storno beantragt')).toBeInTheDocument();
	});

	it('filters by state and offers to clear an empty filter', async () => {
		renderApp('/absences');
		await screen.findByRole('table', { name: 'Meine Anträge 2026' });

		await choose(/Status$/, 'abgelehnt');
		await waitFor(() =>
			expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2)
		);

		await choose(/Art$/, 'Zeitausgleich');
		expect(
			await screen.findByText('Keine Anträge in 2026, die zum Filter passen.')
		).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
		expect(await screen.findByRole('table', { name: 'Meine Anträge 2026' })).toBeInTheDocument();
	});
});
