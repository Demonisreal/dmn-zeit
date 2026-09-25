import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';

const openUsers = async () => {
	renderApp('/admin');
	const table = await screen.findByRole('table', { name: 'Nutzer' });
	return within(table).getByRole('row', { name: /^Jonas Brandt/ });
};

beforeEach(() => {
	server.use(signedInAs('admin'));
});

// jsdom evaluates no container queries, so only the data-priority marks are checked
describe('users', () => {
	it('keeps name, status and the edit button on narrow screens', async () => {
		const row = await openUsers();
		const [name, , status, , , actions] = within(row).getAllByRole('cell');

		for (const cell of [name!, status!, actions!]) {
			expect(cell).not.toHaveAttribute('data-priority');
		}
		expect(
			within(actions!).getByRole('button', { name: 'Jonas Brandt bearbeiten' })
		).toBeInTheDocument();
	});

	it('lets personnel record and last sign-in go first, then the role', async () => {
		const row = await openUsers();
		const [, role, , employee, lastLogin] = within(row).getAllByRole('cell');

		expect(employee).toHaveAttribute('data-priority', 'wide');
		expect(lastLogin).toHaveAttribute('data-priority', 'wide');
		expect(role).toHaveAttribute('data-priority', 'mid');
	});
});
