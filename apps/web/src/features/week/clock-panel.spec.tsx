import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { signInForWeek } from './testing';

const clockGroup = () => screen.findByRole('group', { name: 'Stempeln' });

const settled = (clock: HTMLElement) =>
	waitFor(() => expect(clock).not.toHaveAttribute('aria-busy'));

describe('stamping', () => {
	beforeEach(() => signInForWeek());
	afterEach(() => vi.useRealTimers());

	it('shows the running time of today', async () => {
		renderApp('/');
		const clock = await clockGroup();

		expect(within(clock).getByText('2:16 h')).toBeInTheDocument();
		expect(within(clock).getByText('Läuft seit 08:14')).toBeInTheDocument();
		expect(within(clock).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
		expect(within(clock).getByRole('button', { name: 'Gehen' })).toBeInTheDocument();
	});

	it('takes a break, resumes, clocks out and clocks in again', async () => {
		renderApp('/');
		const clock = await clockGroup();

		await userEvent.click(within(clock).getByRole('button', { name: 'Pause' }));
		expect(await within(clock).findByText('Pause seit 10:30')).toBeInTheDocument();
		await settled(clock);

		await userEvent.click(within(clock).getByRole('button', { name: 'Weiter' }));
		expect(await within(clock).findByText('Läuft seit 10:30')).toBeInTheDocument();
		await settled(clock);

		await userEvent.click(within(clock).getByRole('button', { name: 'Gehen' }));
		expect(await within(clock).findByText('Nicht eingestempelt')).toBeInTheDocument();
		await settled(clock);

		await userEvent.click(within(clock).getByRole('button', { name: 'Kommen' }));
		expect(await within(clock).findByText('Läuft seit 10:30')).toBeInTheDocument();
		await settled(clock);
		expect(within(clock).getByRole('button', { name: 'Gehen' })).toBeInTheDocument();
	});

	it('clocks out straight from a break', async () => {
		renderApp('/');
		const clock = await clockGroup();

		await userEvent.click(within(clock).getByRole('button', { name: 'Pause' }));
		expect(await within(clock).findByText('Pause seit 10:30')).toBeInTheDocument();
		await settled(clock);

		await userEvent.click(within(clock).getByRole('button', { name: 'Gehen' }));
		expect(await within(clock).findByText('Nicht eingestempelt')).toBeInTheDocument();
		await settled(clock);
		expect(within(clock).getByText('Nicht eingestempelt')).toBeInTheDocument();
		expect(within(clock).getByRole('button', { name: 'Kommen' })).toBeInTheDocument();
	});

	it('shows the new state at once and takes it back when the server refuses', async () => {
		let release!: () => void;
		const answered = new Promise<void>((resolve) => (release = resolve));
		server.use(
			http.post('/api/clock/out', async () => {
				await answered;
				return HttpResponse.json(
					{ code: 'INVALID_STATE', message: 'Clock is in another state', details: null },
					{ status: 409 }
				);
			})
		);
		renderApp('/');
		const clock = await clockGroup();

		await userEvent.click(within(clock).getByRole('button', { name: 'Gehen' }));

		expect(await within(clock).findByText('Nicht eingestempelt')).toBeInTheDocument();
		expect(within(clock).getByRole('button', { name: 'Kommen' })).toBeInTheDocument();

		release();

		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Der Stempelstatus hat sich inzwischen geändert'
		);
		expect(within(clock).getByText('Läuft seit 08:14')).toBeInTheDocument();
		expect(within(clock).getByRole('button', { name: 'Gehen' })).toBeInTheDocument();
	});
});
