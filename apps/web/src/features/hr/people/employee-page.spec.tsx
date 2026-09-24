import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { hrHandlers, mockEmployees, resetMockHr, signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';

const lea = mockEmployees.find((employee) => employee.lastName === 'Schwerdtfeger')!;
const mara = mockEmployees.find((employee) => employee.lastName === 'Lenz')!;

const typeDate = async (label: string, digits: string) => {
	const [day] = within(screen.getByRole('group', { name: label })).getAllByRole('spinbutton');
	await userEvent.click(day!);
	await userEvent.keyboard(digits);
};

const choose = async (label: RegExp, option: string) => {
	await userEvent.click(screen.getByRole('button', { name: label }));
	await userEvent.click(await screen.findByRole('option', { name: option }));
};

beforeEach(() => {
	resetMockHr();
	server.use(signedInAs('hr'), ...hrHandlers);
});

describe('employee page', () => {
	it('lists the contract history with the newest contract first', async () => {
		renderApp(`/hr/people/${lea.id}`);

		const table = await screen.findByRole('table', { name: 'Verträge' });
		const rows = within(table).getAllByRole('row').slice(1);

		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lea Schwerdtfeger');
		expect(rows).toHaveLength(3);
		expect(rows[0]).toHaveTextContent('01.07.2026');
		expect(rows[0]).toHaveTextContent('Teilzeit 3 Tage (Mo–Mi)');
		expect(rows[0]).toHaveTextContent('23:24 h');
		expect(rows[2]).toHaveTextContent('Vollzeit 38,5 h (bis 2023)');
	});

	it('adds a contract that starts on a later date', async () => {
		let sent: unknown;
		server.use(
			http.post('/api/employees/:id/contracts', async ({ request }) => {
				sent = await request.clone().json();
			})
		);
		renderApp(`/hr/people/${mara.id}`);
		await userEvent.click(await screen.findByRole('button', { name: 'Neuer Vertrag' }));

		await typeDate('Gültig ab', '01122026');
		await choose(/Arbeitszeitmodell/, 'Teilzeit 30 h (Mo–Fr)');
		const days = screen.getByLabelText('Urlaub je Jahr');
		await userEvent.clear(days);
		await userEvent.type(days, '27,5');
		await userEvent.click(screen.getByRole('button', { name: 'Vertrag speichern' }));

		const table = screen.getByRole('table', { name: 'Verträge' });
		expect(await within(table).findByText(/01\.12\.2026/)).toBeInTheDocument();
		expect(within(table).getAllByRole('row')).toHaveLength(3);
		expect(sent).toEqual({
			validFrom: '2026-12-01',
			workModelId: '8d1a63ae-3e07-4950-b170-6b88875aa4b6',
			vacationDaysYear: '27.5',
			vacationBasisDays: 5,
			flexCapPlusMinutes: null,
			flexCapMinusMinutes: null
		});
	});

	it('refuses a contract that would start before the entry date', async () => {
		renderApp(`/hr/people/${mara.id}`);
		await userEvent.click(await screen.findByRole('button', { name: 'Neuer Vertrag' }));

		await typeDate('Gültig ab', '01012020');
		await choose(/Arbeitszeitmodell/, 'Vollzeit 40 h (Mo–Fr)');
		await userEvent.click(screen.getByRole('button', { name: 'Vertrag speichern' }));

		expect(await screen.findByText('Liegt vor dem Eintritt am 01.02.2021')).toBeInTheDocument();
	});

	it('names the fields that are missing', async () => {
		renderApp(`/hr/people/${mara.id}`);
		await userEvent.click(await screen.findByRole('button', { name: 'Neuer Vertrag' }));

		await userEvent.click(screen.getByRole('button', { name: 'Vertrag speichern' }));

		expect(await screen.findAllByText('Pflichtfeld')).toHaveLength(2);
	});
});
