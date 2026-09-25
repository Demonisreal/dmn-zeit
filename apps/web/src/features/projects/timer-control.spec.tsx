import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { signInForProjects, typeSegments } from './mocks-support';

const timer = () => screen.findByRole('group', { name: 'Projekt-Timer' });

const settled = (group: HTMLElement) =>
	waitFor(() => expect(group).not.toHaveAttribute('aria-busy'));

describe('project timer', () => {
	afterEach(() => vi.useRealTimers());

	it('stops the running timer and starts another project', async () => {
		signInForProjects();
		renderApp('/projects');
		const group = await timer();

		expect(
			within(group).getByText(
				'Bäckerei Hagen GmbH (Beispiel) · Finanzbuchhaltung 2026 · Belegerfassung'
			)
		).toBeInTheDocument();
		expect(within(group).getByText('1:59 h')).toBeInTheDocument();
		expect(within(group).getByText('Läuft seit 08:31')).toBeInTheDocument();
		expect(screen.getAllByRole('group', { name: 'Laufender Timer' }).length).toBeGreaterThan(0);

		await userEvent.click(within(group).getByRole('button', { name: 'Stopp' }));
		expect(await within(group).findByText('Kein Timer läuft')).toBeInTheDocument();
		await settled(group);
		expect(screen.queryByRole('group', { name: 'Laufender Timer' })).not.toBeInTheDocument();
		expect(within(group).getByRole('button', { name: 'Start' })).toBeDisabled();

		await userEvent.click(within(group).getByRole('combobox', { name: 'Projekt' }));
		await userEvent.click(await screen.findByRole('option', { name: 'Lohnabrechnung' }));
		await userEvent.click(within(group).getByRole('button', { name: 'Start' }));

		expect(await within(group).findByText('Läuft seit 10:30')).toBeInTheDocument();
		expect(
			within(group).getByText('Bäckerei Hagen GmbH (Beispiel) · Lohnabrechnung')
		).toBeInTheDocument();
	});

	it('offers to correct the end once the timer runs past 12 hours', async () => {
		const sent: unknown[] = [];
		server.use(
			http.patch('/api/project-entries/:id', async ({ request }) => {
				sent.push(await request.clone().json());
			})
		);
		signInForProjects('solo-many');
		renderApp('/');
		const group = await timer();

		expect(within(group).getByText('17:50 h')).toBeInTheDocument();
		expect(
			screen.getByText(/Der Timer läuft seit 23\.09\. 16:40, also mehr als 12 Stunden/)
		).toBeInTheDocument();
		expect(screen.getAllByText('über 12 h').length).toBeGreaterThan(0);

		await userEvent.click(within(group).getByRole('button', { name: 'Stopp' }));

		const dialog = await screen.findByRole('dialog', { name: 'Ende korrigieren' });
		const form = within(dialog).getByRole('form', { name: 'Ende korrigieren' });
		expect(within(form).getByRole('combobox', { name: 'Projekt' })).toHaveValue('Relaunch 2026');
		await typeSegments(form, 'Ende', '1800');
		await userEvent.click(within(form).getByRole('button', { name: 'Speichern' }));

		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
		expect(sent).toEqual([{ endedAt: '2026-09-23T16:00:00.000Z' }]);
	});
});
