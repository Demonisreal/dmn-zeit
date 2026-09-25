import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { hrHandlers, mockEmployees, resetMockHr, signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';

const frank = mockEmployees.find((employee) => employee.lastName === 'Oberdiek')!;

beforeEach(() => {
	resetMockHr();
	server.use(signedInAs('hr'), ...hrHandlers);
});

const openForm = async () => {
	renderApp(`/hr/flex?employee=${frank.id}&year=2026`);
	await screen.findByRole('table', { name: 'Buchungen' });
	await userEvent.click(screen.getByRole('button', { name: 'Buchung erfassen' }));
	return screen.getByRole('form', { name: 'Buchung erfassen' });
};

const fill = async (
	form: HTMLElement,
	type: string,
	time: string,
	reason: string,
	day = '30092026'
) => {
	await userEvent.click(within(form).getByRole('button', { name: /Art/ }));
	await userEvent.click(await screen.findByRole('option', { name: type }));
	await userEvent.type(within(form).getByLabelText('Zeit'), time);
	await userEvent.type(within(form).getByLabelText('Begründung'), reason);
	const [dayField] = within(within(form).getByRole('group', { name: 'Wirksam am' })).getAllByRole(
		'spinbutton'
	);
	await userEvent.click(dayField!);
	await userEvent.keyboard(day);
};

describe('flextime postings', () => {
	it('insists that a payout lowers the balance', async () => {
		let posted = false;
		server.use(
			http.post('/api/employees/:id/flex/bookings', () => {
				posted = true;
				return HttpResponse.json({}, { status: 201 });
			})
		);
		const form = await openForm();

		await fill(form, 'Auszahlung', '8:00', 'Auszahlung mit der Septemberabrechnung');
		await userEvent.click(within(form).getByRole('button', { name: 'Buchen' }));

		expect(
			await within(form).findByText(
				'Eine Auszahlung senkt den Saldo, die Minuten müssen negativ sein'
			)
		).toBeInTheDocument();
		expect(within(form).getByLabelText('Zeit')).toHaveAttribute('aria-invalid', 'true');
		expect(posted).toBe(false);
	});

	it('posts a payout with a minus and lists it', async () => {
		let sent: unknown;
		server.use(
			http.post('/api/employees/:id/flex/bookings', async ({ request }) => {
				sent = await request.clone().json();
			})
		);
		const form = await openForm();

		await fill(form, 'Auszahlung', '-8:00', 'Auszahlung mit der Septemberabrechnung');
		await userEvent.click(within(form).getByRole('button', { name: 'Buchen' }));

		const table = screen.getByRole('table', { name: 'Buchungen' });
		expect(
			await within(table).findByText('Auszahlung mit der Septemberabrechnung')
		).toBeInTheDocument();
		expect(sent).toMatchObject({ type: 'payout', minutes: -480 });
	});

	it('does not offer the cap as a manual posting', async () => {
		const form = await openForm();

		await userEvent.click(within(form).getByRole('button', { name: /Art/ }));

		const options = (await screen.findAllByRole('option')).map((option) => option.textContent);
		expect(options).toEqual(['Anfangssaldo', 'Manuelle Buchung', 'Auszahlung']);
	});

	it('refuses a posting in a month that is already closed', async () => {
		const form = await openForm();

		// the mock has closed everything up to july
		await fill(
			form,
			'Manuelle Buchung',
			'2:00',
			'Mehrarbeit Jahresabschluss nachgetragen',
			'15072026'
		);
		await userEvent.click(within(form).getByRole('button', { name: 'Buchen' }));

		expect(await within(form).findByRole('alert')).toHaveTextContent(
			'Der Zeitraum liegt in einem abgeschlossenen Monat und ist gesperrt.'
		);
		expect(
			within(screen.getByRole('table', { name: 'Buchungen' })).queryByText(
				'Mehrarbeit Jahresabschluss nachgetragen'
			)
		).not.toBeInTheDocument();
	});

	it('wants a reason of some length', async () => {
		const form = await openForm();

		await fill(form, 'Manuelle Buchung', '2:00', 'kurz');
		await userEvent.click(within(form).getByRole('button', { name: 'Buchen' }));

		expect(await within(form).findByText('Mindestens 10 Zeichen')).toBeInTheDocument();
	});
});
