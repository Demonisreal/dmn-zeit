import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';
import styles from './users-page.module.css';

const openUsers = async () => {
	renderApp('/admin');
	const table = await screen.findByRole('table', { name: 'Nutzer' });
	return within(table).getByRole('row', { name: /^Jonas Brandt/ });
};

beforeEach(() => {
	server.use(signedInAs('admin'));
});

// jsdom evaluates no container queries, so only the classes that hide on narrow screens are checked
describe('users', () => {
	it('keeps name, status and the edit button on narrow screens', async () => {
		const row = await openUsers();
		const [name, , status, , , actions] = within(row).getAllByRole('cell');

		for (const cell of [name!, status!, actions!]) {
			expect(cell).not.toHaveClass(styles.wide!);
			expect(cell).not.toHaveClass(styles.mid!);
		}
		expect(
			within(actions!).getByRole('button', { name: 'Jonas Brandt bearbeiten' })
		).toBeInTheDocument();
	});

	it('lets personnel record and last sign-in go first, then the role', async () => {
		const row = await openUsers();
		const [, role, , employee, lastLogin] = within(row).getAllByRole('cell');

		expect(employee).toHaveClass(styles.wide!);
		expect(lastLogin).toHaveClass(styles.wide!);
		expect(role).toHaveClass(styles.mid!);
	});
});
