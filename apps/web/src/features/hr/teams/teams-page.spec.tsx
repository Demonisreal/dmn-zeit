import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { hrHandlers, mockEmployees, resetMockHr, signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';

const helin = mockEmployees.find((employee) => employee.lastName === 'Demir')!;

beforeEach(() => {
	resetMockHr();
	server.use(signedInAs('hr'), ...hrHandlers);
});

const rowOf = (name: string) => screen.getByRole('cell', { name }).closest('tr')!;

describe('teams', () => {
	it('creates a team and gives it a lead', async () => {
		let leads: unknown;
		server.use(
			http.put('/api/teams/:id/leads', async ({ request }) => {
				leads = await request.clone().json();
			})
		);
		renderApp('/hr/teams');
		await userEvent.click(await screen.findByRole('button', { name: 'Team anlegen' }));

		await userEvent.type(screen.getByLabelText('Team'), 'Digitale Buchhaltung');
		await userEvent.click(screen.getByRole('button', { name: 'Team anlegen' }));

		const row = await screen.findByRole('cell', { name: 'Digitale Buchhaltung' });
		expect(within(row.closest('tr')!).getByText('keine')).toBeInTheDocument();

		await userEvent.click(
			within(rowOf('Digitale Buchhaltung')).getByRole('button', { name: 'Leitung festlegen' })
		);
		const group = screen.getByRole('group', { name: 'Teamleitung für Digitale Buchhaltung' });
		await userEvent.click(within(group).getByRole('checkbox', { name: 'Helin Demir' }));
		await userEvent.click(screen.getByRole('button', { name: 'Leitung speichern' }));

		expect(
			await within(rowOf('Digitale Buchhaltung')).findByText('Helin Demir')
		).toBeInTheDocument();
		expect(leads).toEqual({ userIds: [helin.userId] });
	});

	it('shows the current leads as chosen and keeps them when another joins', async () => {
		renderApp('/hr/teams');
		await screen.findByRole('cell', { name: 'Lohnbuchhaltung' });

		await userEvent.click(
			within(rowOf('Lohnbuchhaltung')).getByRole('button', { name: 'Leitung festlegen' })
		);
		const group = screen.getByRole('group', { name: 'Teamleitung für Lohnbuchhaltung' });
		expect(within(group).getByRole('checkbox', { name: 'Frank Oberdiek' })).toBeChecked();
		await userEvent.click(within(group).getByRole('checkbox', { name: 'Helin Demir' }));
		await userEvent.click(screen.getByRole('button', { name: 'Leitung speichern' }));

		expect(
			await within(rowOf('Lohnbuchhaltung')).findByText('Frank Oberdiek, Helin Demir')
		).toBeInTheDocument();
	});
});
