import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { projectIds, signInForBilling } from './testing';

describe('project page', () => {
	it('shows a budget that is used up with its derivation', async () => {
		signInForBilling();
		renderApp(`/billing/projects/${projectIds.overbeckClosing}`);

		expect(
			await screen.findByText('25:55 h von 24:00 h verbraucht, Budget überschritten')
		).toBeInTheDocument();
		expect(screen.getByText('108 %')).toBeInTheDocument();
		expect(
			screen.getByRole('link', { name: 'Zurück zu Tischlerei Overbeck (Beispiel)' })
		).toBeInTheDocument();
	});

	it('warns from 80 percent and names who may book', async () => {
		signInForBilling();
		renderApp(`/billing/projects/${projectIds.brinkmannClosing}`);

		expect(
			await screen.findByText('34:00 h von 40:00 h verbraucht, Warnung ab 80 %')
		).toBeInTheDocument();
		expect(screen.getByRole('checkbox', { name: 'Für alle buchbar' })).not.toBeChecked();
		expect(await screen.findByText('Katrin Hölscher, Mara Lenz')).toBeInTheDocument();
	});

	it('switches from open to everyone to a list of members', async () => {
		let patch: unknown;
		let members: unknown;
		server.use(
			http.patch('/api/projects/:id', async ({ request }) => {
				patch = await request.clone().json();
			}),
			http.put('/api/projects/:id/members', async ({ request }) => {
				members = await request.clone().json();
			})
		);
		signInForBilling();
		renderApp(`/billing/projects/${projectIds.hagenBooks}`);

		const open = await screen.findByRole('checkbox', { name: 'Für alle buchbar' });
		expect(open).toBeChecked();
		expect(screen.queryByRole('button', { name: 'Mitglieder festlegen' })).not.toBeInTheDocument();

		await userEvent.click(open);
		expect(await screen.findByText('Noch keine Mitglieder.')).toBeInTheDocument();
		expect(screen.getByText('Gespeichert, gilt ab sofort.')).toBeInTheDocument();
		expect(patch).toEqual({ openToAll: false });

		await userEvent.click(screen.getByRole('button', { name: 'Mitglieder festlegen' }));
		expect(screen.queryByText('Gespeichert, gilt ab sofort.')).not.toBeInTheDocument();
		const group = await screen.findByRole('group', {
			name: 'Mitglieder von Finanzbuchhaltung 2026'
		});
		await userEvent.click(await within(group).findByRole('checkbox', { name: 'Katrin Hölscher' }));
		await userEvent.click(screen.getByRole('button', { name: 'Mitglieder speichern' }));

		expect(await screen.findByText('Katrin Hölscher')).toBeInTheDocument();
		expect(members).toEqual({ employeeIds: ['2cfefd95-d735-4202-bf6e-eaaaaef60f62'] });
	});

	it('leaves members out of a solo workspace', async () => {
		signInForBilling('solo');
		renderApp(`/billing/projects/${projectIds.stadtwerkePortal}`);

		expect(await screen.findByText(/verbraucht, Budget überschritten/)).toBeInTheDocument();
		expect(screen.queryByRole('checkbox', { name: 'Für alle buchbar' })).not.toBeInTheDocument();
		expect(screen.queryByRole('columnheader', { name: 'Person' })).not.toBeInTheDocument();
	});

	it('adds a task that follows the project on billing', async () => {
		signInForBilling();
		renderApp(`/billing/projects/${projectIds.hagenBooks}`);

		await userEvent.click(await screen.findByRole('button', { name: 'Aufgabe anlegen' }));
		const form = screen.getByRole('form', { name: 'Aufgabe anlegen' });
		await userEvent.type(within(form).getByLabelText('Aufgabe'), 'Umsatzsteuer-Voranmeldung');
		await userEvent.click(within(form).getByRole('button', { name: 'Aufgabe anlegen' }));

		const tasks = await screen.findByRole('table', { name: 'Aufgaben' });
		const row = (await within(tasks).findByText('Umsatzsteuer-Voranmeldung')).closest('tr')!;
		expect(within(row).getByText('abrechenbar (wie das Projekt)')).toBeInTheDocument();
	});
});
