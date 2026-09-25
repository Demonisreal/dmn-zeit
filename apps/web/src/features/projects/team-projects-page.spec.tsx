import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/render-app';
import { signInForProjects } from './mocks-support';

describe('team project time', () => {
	afterEach(() => vi.useRealTimers());

	it('lists the team and opens one week without amounts', async () => {
		signInForProjects('company', 'team_lead');
		renderApp('/team/projects');
		const overview = await screen.findByRole('table', { name: 'Projektzeit im Team KW 39' });

		const katrin = within(overview).getByRole('button', { name: 'Katrin Hölscher' });
		await userEvent.click(katrin);

		expect(katrin).toHaveAttribute('aria-pressed', 'true');
		const week = await screen.findByRole('table', { name: 'Projektzeit Katrin Hölscher KW 39' });
		expect(within(week).queryByRole('columnheader', { name: 'Betrag' })).not.toBeInTheDocument();
		expect(within(week).getByRole('rowheader', { name: 'Abgleich' })).toBeInTheDocument();
	});

	it('keeps employees out', async () => {
		signInForProjects('company', 'employee');
		const router = renderApp('/team/projects');
		await screen.findByRole('table', { name: 'Buchungen KW 39' });

		expect(router.state.location.pathname).toBe('/');
	});
});
