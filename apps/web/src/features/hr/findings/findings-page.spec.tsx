import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { hrHandlers, mockEmployees, resetMockHr, signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';

const jonas = mockEmployees.find((employee) => employee.lastName === 'Brandt')!;
const range = 'from=2026-01-01&to=2026-09-30';

beforeEach(() => {
	resetMockHr();
	server.use(signedInAs('hr'), ...hrHandlers);
});

describe('findings', () => {
	it('explains each open finding with its facts and paragraph', async () => {
		renderApp(`/hr/findings?${range}`);

		const table = await screen.findByRole('table', { name: 'Befunde nach ArbZG' });
		const row = within(table).getByText('Jonas Brandt').closest('tr')!;

		expect(row).toHaveTextContent('§ 3');
		expect(row).toHaveTextContent('10:40 h gearbeitet, mehr als die zulässigen 10 Stunden');
		expect(row).toHaveTextContent('ArbZG, Fassung 1994');
		expect(within(table).queryByText('Tobias Kämmerer')).toBeNull();
	});

	it('acknowledges a finding with a note', async () => {
		let sent: unknown;
		server.use(
			http.post('/api/compliance/findings/ack', async ({ request }) => {
				sent = await request.clone().json();
			})
		);
		renderApp(`/hr/findings?${range}&state=all`);
		const table = await screen.findByRole('table', { name: 'Befunde nach ArbZG' });
		const row = within(table).getByText('Jonas Brandt').closest('tr')!;

		await userEvent.click(
			within(row).getByRole('button', { name: 'Befund bei Jonas Brandt quittieren' })
		);
		const form = screen.getByRole('form', { name: 'Befund bei Jonas Brandt quittieren' });
		await userEvent.type(within(form).getByLabelText('Vermerk'), 'Umzug Serverraum, einmalig');
		await userEvent.click(within(form).getByRole('button', { name: 'Quittieren' }));

		expect(await within(row).findByText(/Quittiert am .* von Mara Lenz/)).toBeInTheDocument();
		expect(within(row).getByText('Umzug Serverraum, einmalig')).toBeInTheDocument();
		expect(sent).toEqual({
			employeeId: jonas.id,
			date: '2026-09-08',
			code: 'ARBZG_3_OVER_10',
			ruleVersion: 'arbzg-1994',
			note: 'Umzug Serverraum, einmalig'
		});
	});

	it('filters by person and keeps the filter in the address', async () => {
		const router = renderApp(`/hr/findings?${range}`);
		await screen.findByRole('table', { name: 'Befunde nach ArbZG' });

		await userEvent.click(screen.getByRole('button', { name: /Person/ }));
		await userEvent.click(await screen.findByRole('option', { name: 'Jonas Brandt' }));

		const table = await screen.findByRole('table', { name: 'Befunde nach ArbZG' });
		expect(await within(table).findAllByRole('row')).toHaveLength(2);
		expect(router.state.location.search).toMatchObject({ employee: jonas.id });
	});

	it('links the person to the day of the finding in their month', async () => {
		renderApp(`/hr/findings?${range}`);
		const table = await screen.findByRole('table', { name: 'Befunde nach ArbZG' });

		expect(within(table).getByRole('link', { name: 'Jonas Brandt' })).toHaveAttribute(
			'href',
			`/time?employee=${jonas.id}&month=2026-09&day=2026-09-08`
		);
	});

	// jsdom evaluates no container queries, so only the data-priority marks are checked
	it('keeps date, person, rule and state on narrow screens', async () => {
		renderApp(`/hr/findings?${range}`);
		const table = await screen.findByRole('table', { name: 'Befunde nach ArbZG' });
		const row = within(table).getByText('Jonas Brandt').closest('tr')!;
		const [date, name, rule, , state] = within(row).getAllByRole('cell');

		for (const cell of [date!, name!, rule!, state!]) {
			expect(cell).not.toHaveAttribute('data-priority');
		}
	});

	it('lets the rule version and the finding text go first on narrow screens', async () => {
		renderApp(`/hr/findings?${range}`);
		const table = await screen.findByRole('table', { name: 'Befunde nach ArbZG' });
		const row = within(table).getByText('Jonas Brandt').closest('tr')!;
		const [, , rule, version] = within(row).getAllByRole('cell');

		expect(version).toHaveAttribute('data-priority', 'wide');
		expect(within(rule!).getByText(/10:40 h gearbeitet/)).toHaveAttribute('data-priority', 'mid');
	});

	it('lists the limits of each rule version', async () => {
		renderApp(`/hr/findings?${range}`);

		const table = await screen.findByRole('table', { name: 'Regelversionen' });
		const row = within(table).getByRole('rowheader', {
			name: 'Ruhezeit zwischen zwei Arbeitstagen (§ 5)'
		});
		expect(row.closest('tr')).toHaveTextContent('11:00 h');
	});
});
