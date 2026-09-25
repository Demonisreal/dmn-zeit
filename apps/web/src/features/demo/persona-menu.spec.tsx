import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSandbox } from '../../lib/api/demo';
import { queryClient, sessionKey } from '../../lib/api/query-client';
import { resetMockDemo } from '../../mocks/demo';
import { mockSession } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';

// header and mobile panel both carry the switch, without the stylesheet jsdom shows both
const openSwitch = async () => {
	const [trigger] = await screen.findAllByRole('button', { name: 'Rolle wechseln' });
	await userEvent.click(trigger!);
	return screen.findByRole('menu', { name: 'Rolle wechseln' });
};

describe('persona switch', () => {
	beforeEach(async () => {
		resetMockDemo('demo');
		queryClient.setQueryData(sessionKey, await createSandbox({ locale: 'de' }));
	});

	it('lists one person per role and marks the current one', async () => {
		renderApp('/');
		const menu = await openSwitch();

		const entries = await within(menu).findAllByRole('menuitemradio');
		expect(entries.map((entry) => entry.textContent)).toEqual([
			'BeschäftigteJonas Brandt',
			'TeamleitungKatrin Hölscher',
			'PersonalverwaltungSabine Kortmann',
			'AdministrationMara Lenz'
		]);
		expect(entries[0]).toHaveAttribute('aria-checked', 'true');
		expect(entries[1]).toHaveAccessibleDescription('Katrin Hölscher');
	});

	it('switches to the team lead and opens her inbox', async () => {
		const router = renderApp('/demo/outbox');
		const menu = await openSwitch();

		await userEvent.click(await within(menu).findByRole('menuitemradio', { name: 'Teamleitung' }));

		expect(await screen.findByRole('button', { name: 'Katrin Hölscher' })).toBeInTheDocument();
		await waitFor(() => expect(router.state.location.pathname).toBe('/inbox'));
		expect(await screen.findByRole('heading', { name: 'Posteingang' })).toBeInTheDocument();
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
	});

	it('takes hr to the month closing and the employee back to her week', async () => {
		const router = renderApp('/');

		await userEvent.click(
			await within(await openSwitch()).findByRole('menuitemradio', { name: 'Personalverwaltung' })
		);
		await waitFor(() => expect(router.state.location.pathname).toBe('/hr/months'));
		expect(await screen.findByRole('heading', { name: 'Monatsabschluss' })).toBeInTheDocument();

		await userEvent.click(
			await within(await openSwitch()).findByRole('menuitemradio', { name: 'Beschäftigte' })
		);
		await waitFor(() => expect(router.state.location.pathname).toBe('/'));
		expect(await screen.findByRole('heading', { name: 'Woche' })).toBeInTheDocument();
	});

	it('keeps the menu open and says so when the switch fails', async () => {
		server.use(
			http.post('/api/demo/switch', () =>
				HttpResponse.json({ code: 'INTERNAL', message: 'Boom', details: null }, { status: 500 })
			)
		);
		renderApp('/');
		const menu = await openSwitch();

		await userEvent.click(
			await within(menu).findByRole('menuitemradio', { name: 'Administration' })
		);

		expect(await screen.findByRole('alert')).toHaveTextContent('Das hat nicht geklappt.');
		expect(menu).toBeInTheDocument();
		expect(within(menu).getByRole('menuitemradio', { name: 'Beschäftigte' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
	});

	it('marks the sandbox with its deletion time and links the outbox', async () => {
		renderApp('/');

		expect(
			await screen.findByText(
				/^Erfundener Musterbetrieb, wird am \d{1,2}\. \p{L}+ um \d\d:\d\d Uhr gelöscht\.$/u
			)
		).toBeInTheDocument();
		expect(screen.getByText('Beispieldaten')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Postausgang' })).toHaveAttribute(
			'href',
			'/demo/outbox'
		);
	});

	it('shows neither switch nor banner for a live tenant', async () => {
		resetMockDemo('live');
		queryClient.setQueryData(sessionKey, mockSession);
		renderApp('/');

		expect(await screen.findByRole('heading', { name: 'Woche' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Rolle wechseln' })).not.toBeInTheDocument();
		expect(screen.queryByText('Beispieldaten')).not.toBeInTheDocument();
	});
});
