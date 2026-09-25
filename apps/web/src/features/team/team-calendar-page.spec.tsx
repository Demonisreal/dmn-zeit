import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TeamCalendar } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { signInAs } from '../absences/test-session';

const steuerberatung = { id: 'e1f9ecbb-e6ff-4aa4-b29b-703459281a47', name: 'Steuerberatung' };
const lohnbuchhaltung = { id: 'c1b89b13-aeb6-4609-a49e-f1fe33512388', name: 'Lohnbuchhaltung' };

const person = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name}`) });

describe('team calendar', () => {
	afterEach(() => vi.useRealTimers());

	it('shows team leads the kind of every absence', async () => {
		signInAs('team_lead', [steuerberatung]);
		renderApp('/team/calendar');

		await screen.findByRole('region', { name: 'Teamkalender September 2026' });
		expect(screen.getByText('Steuerberatung')).toBeInTheDocument();
		expect(within(person('Deniz Aydın')).getAllByText('Urlaub')).toHaveLength(5);
		expect(within(person('Tobias Kämmerer')).getAllByText('Krankheit')).toHaveLength(5);
		expect(screen.queryByText('abwesend')).not.toBeInTheDocument();
		// Tobias is sick from the 21st on, alone that day
		const absent = within(person('Abwesend')).getAllByRole('cell');
		expect(absent[20]).toHaveTextContent('1');
		expect(screen.getByText(/U Urlaub, K Krankheit, Z Zeitausgleich/)).toBeInTheDocument();
	});

	it('shows employees only that someone is away', async () => {
		let asked: URL | undefined;
		const calendar: TeamCalendar = {
			month: '2026-09',
			holidays: [],
			people: [
				{
					employee: { id: 'bc1e61b4-d3d8-4290-9124-bc7adf87efde', name: 'Deniz Aydın' },
					days: ['2026-09-07', '2026-09-08'].map((date) => ({
						date,
						portion: 1,
						type: 'absent',
						status: null
					}))
				},
				{
					employee: { id: '8d41b7c2-0e5f-4a93-b6d8-2c7e9f13a054', name: 'Mara Lenz' },
					days: []
				}
			]
		};
		signInAs('employee');
		server.use(
			http.get('/api/team-calendar', ({ request }) => {
				asked = new URL(request.url);
				return HttpResponse.json(calendar);
			})
		);
		renderApp('/team/calendar');

		const grid = await screen.findByRole('region', { name: 'Teamkalender September 2026' });
		expect(within(person('Deniz Aydın')).getAllByText('abwesend')).toHaveLength(2);
		expect(within(grid).queryByText('Urlaub')).not.toBeInTheDocument();
		expect(screen.queryByLabelText('Team')).not.toBeInTheDocument();
		expect(
			screen.getByText(/den Grund sehen nur Teamleitung und Personalverwaltung/)
		).toBeInTheDocument();
		// without a team the api answers with the employee's own
		expect(asked?.searchParams.has('team')).toBe(false);
	});

	it('lets a lead of several teams switch between them', async () => {
		signInAs('team_lead', [steuerberatung, lohnbuchhaltung]);
		renderApp('/team/calendar');
		await screen.findByRole('region', { name: 'Teamkalender September 2026' });

		await userEvent.click(screen.getByRole('button', { name: /Team$/ }));
		await userEvent.click(await screen.findByRole('option', { name: 'Lohnbuchhaltung' }));

		expect(
			await within(await screen.findByRole('row', { name: /^Frank Oberdiek/ })).findAllByText(
				'Urlaub'
			)
		).toHaveLength(10);
		expect(within(person('Helin Demir')).getAllByText('Krankheit')).toHaveLength(2);
		expect(screen.queryByRole('row', { name: /^Deniz Aydın/ })).not.toBeInTheDocument();
	});

	it('gives hr every team and says when one is empty', async () => {
		signInAs('hr');
		renderApp('/team/calendar');
		await screen.findByRole('region', { name: 'Teamkalender September 2026' });
		await userEvent.click(screen.getByRole('button', { name: /Team$/ }));
		expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
			'Steuerberatung',
			'Lohnbuchhaltung',
			'Finanzbuchhaltung'
		]);

		await userEvent.click(screen.getByRole('option', { name: 'Finanzbuchhaltung' }));

		expect(await screen.findByText('In diesem Team ist niemand eingetragen.')).toBeInTheDocument();
	});

	it('links each name to the month of that person for hr', async () => {
		signInAs('hr');
		renderApp('/team/calendar');
		await screen.findByRole('region', { name: 'Teamkalender September 2026' });

		expect(
			within(person('Deniz Aydın')).getByRole('link', { name: 'Deniz Aydın' })
		).toHaveAttribute('href', '/time?employee=bc1e61b4-d3d8-4290-9124-bc7adf87efde&month=2026-09');
	});

	it('links the names of their own team to the month shown for a team lead', async () => {
		signInAs('team_lead', [steuerberatung]);
		renderApp('/team/calendar?month=2026-10');
		await screen.findByRole('region', { name: 'Teamkalender Oktober 2026' });

		expect(
			within(person('Tobias Kämmerer')).getByRole('link', { name: 'Tobias Kämmerer' })
		).toHaveAttribute('href', '/time?employee=09cbac3e-5b5a-474e-9654-f777b63fddad&month=2026-10');
	});

	it('keeps the names plain text for employees', async () => {
		signInAs('employee');
		renderApp('/team/calendar');
		const grid = await screen.findByRole('region', { name: 'Teamkalender September 2026' });

		expect(within(grid).getByRole('rowheader', { name: 'Deniz Aydın' })).toBeInTheDocument();
		expect(within(grid).queryByRole('link')).not.toBeInTheDocument();
	});

	it('links no names when a lead opens a team they do not lead', async () => {
		signInAs('team_lead', [steuerberatung]);
		renderApp(`/team/calendar?team=${lohnbuchhaltung.id}`);
		const grid = await screen.findByRole('region', { name: 'Teamkalender September 2026' });

		expect(within(grid).getByRole('rowheader', { name: 'Frank Oberdiek' })).toBeInTheDocument();
		expect(within(grid).queryByRole('link')).not.toBeInTheDocument();
	});

	it('marks requested days and public holidays in the next month', async () => {
		signInAs('team_lead', [steuerberatung]);
		renderApp('/team/calendar');
		await screen.findByRole('region', { name: 'Teamkalender September 2026' });

		await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));

		await screen.findByRole('region', { name: 'Teamkalender Oktober 2026' });
		expect(
			screen.getByRole('columnheader', { name: 'Sa., 03.10., Tag der Deutschen Einheit' })
		).toBeInTheDocument();
		expect(within(person('Deniz Aydın')).getAllByText('Urlaub, beantragt')).toHaveLength(10);
		expect(
			within(person('Tobias Kämmerer')).getAllByText('Urlaub, Stornierung beantragt')
		).toHaveLength(5);
	});
});
