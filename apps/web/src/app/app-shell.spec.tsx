import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signInForWeek } from '../features/week/testing';
import { renderApp } from '../test/render-app';

const mainNav = () => within(screen.getByRole('navigation', { name: 'Hauptnavigation' }));

describe('app shell', () => {
	beforeEach(() => signInForWeek());
	afterEach(() => vi.useRealTimers());

	it('leaves the focus alone when the app is loaded', async () => {
		renderApp('/');
		await screen.findByRole('table', { name: 'Buchungen KW 39' });

		expect(document.getElementById('main')).not.toHaveFocus();
	});

	it('moves the focus to the content after going to another page', async () => {
		renderApp('/');
		await screen.findByRole('table', { name: 'Buchungen KW 39' });

		await userEvent.click(mainNav().getByRole('link', { name: 'Monat' }));

		await waitFor(() => expect(document.getElementById('main')).toHaveFocus());
		expect(
			await screen.findByRole('table', { name: 'Buchungen September 2026' })
		).toBeInTheDocument();
	});

	it('does not move the focus when only the week in the query changes', async () => {
		const router = renderApp('/');
		await screen.findByRole('table', { name: 'Buchungen KW 39' });

		await userEvent.click(screen.getByRole('button', { name: 'Vorherige Woche' }));
		await screen.findByRole('table', { name: 'Buchungen KW 38' });

		expect(router.state.location.pathname).toBe('/');
		expect(router.state.location.search).toEqual({ week: '2026-09-14' });
		expect(document.getElementById('main')).not.toHaveFocus();
	});
});
