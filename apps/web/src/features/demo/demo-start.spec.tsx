import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { refuseMockSandbox, resetMockDemo } from '../../mocks/demo';
import { renderApp } from '../../test/render-app';

const start = async () => {
	await screen.findByRole('heading', { name: 'DMN Zeit ausprobieren' });
	await userEvent.click(screen.getByRole('button', { name: 'Demo starten' }));
};

describe('demo start', () => {
	beforeEach(() => resetMockDemo('demo'));

	it('replaces the login form with the demo entry', async () => {
		renderApp('/login');

		expect(
			await screen.findByRole('heading', { name: 'DMN Zeit ausprobieren' })
		).toBeInTheDocument();
		expect(screen.getByText(/nach 24 Stunden mit allen Eingaben gelöscht/)).toBeInTheDocument();
		expect(screen.queryByLabelText('E-Mail')).not.toBeInTheDocument();
	});

	it('opens the week of a fresh sandbox as employee', async () => {
		const router = renderApp('/');

		await start();

		expect(await screen.findByText('Beispieldaten')).toBeInTheDocument();
		expect(router.state.location.pathname).toBe('/');
		expect(screen.getByRole('button', { name: 'Jonas Brandt' })).toBeInTheDocument();
	});

	it('names the wait when this address started too many demos', async () => {
		refuseMockSandbox('throttled');
		renderApp('/login');

		await start();

		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Von diesem Anschluss wurden in kurzer Zeit zu viele Demos gestartet. In 10 Minuten geht es wieder.'
		);
	});

	it('says so when the demo is full', async () => {
		refuseMockSandbox('full');
		renderApp('/login');

		await start();

		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Die Demo ist gerade voll. In 15 Minuten geht es wieder.'
		);
		expect(screen.getByRole('button', { name: 'Demo starten' })).toBeEnabled();
	});

	it('keeps the login form outside the demo', async () => {
		resetMockDemo('live');
		renderApp('/login');

		expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Demo starten' })).not.toBeInTheDocument();
	});
});
