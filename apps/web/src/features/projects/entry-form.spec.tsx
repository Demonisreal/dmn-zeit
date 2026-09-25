import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { signInForProjects, typeSegments } from './mocks-support';

async function openForm() {
	renderApp('/projects');
	await screen.findByRole('table', { name: 'Projektzeit KW 39' });
	await userEvent.click(screen.getByRole('button', { name: 'Projektzeit nachtragen' }));
	return screen.getByRole('form', { name: 'Projektzeit nachtragen' });
}

async function pickProject(form: HTMLElement, name: string) {
	await userEvent.click(within(form).getByRole('combobox', { name: 'Projekt' }));
	await userEvent.click(await screen.findByRole('option', { name }));
}

// passes the request on to the mock api after noting what was sent
const capture = () => {
	const sent: unknown[] = [];
	server.use(
		http.post('/api/project-entries', async ({ request }) => {
			sent.push(await request.clone().json());
		})
	);
	return sent;
};

describe('manual project entry', () => {
	beforeEach(() => signInForProjects());
	afterEach(() => vi.useRealTimers());

	it('asks for project, times and the note before sending anything', async () => {
		const sent = capture();
		const form = await openForm();

		await userEvent.click(within(form).getByRole('button', { name: 'Nachtragen' }));

		expect(
			await within(form).findByText('Beim Nachtrag ist eine Notiz Pflicht')
		).toBeInTheDocument();
		expect(within(form).getAllByText('Pflichtfeld')).toHaveLength(3);
		expect(within(form).getByLabelText('Notiz')).toHaveAttribute('aria-invalid', 'true');
		expect(sent).toHaveLength(0);
	});

	it('refuses an end before the start', async () => {
		const sent = capture();
		const form = await openForm();

		await pickProject(form, 'Lohnabrechnung');
		await typeSegments(form, 'Beginn', '1500');
		await typeSegments(form, 'Ende', '1400');
		await userEvent.type(within(form).getByLabelText('Notiz'), 'Lohnjournal abgestimmt');
		await userEvent.click(within(form).getByRole('button', { name: 'Nachtragen' }));

		expect(await within(form).findByText('Das Ende liegt vor dem Beginn')).toBeInTheDocument();
		expect(sent).toHaveLength(0);
	});

	it('books the entry with the note', async () => {
		const sent = capture();
		const form = await openForm();

		await pickProject(form, 'Lohnabrechnung');
		await typeSegments(form, 'Beginn', '0700');
		await typeSegments(form, 'Ende', '0815');
		expect(within(form).getByText('Dauer 1:15 h')).toBeInTheDocument();
		await userEvent.type(within(form).getByLabelText('Notiz'), 'Lohnjournal abgestimmt');
		await userEvent.click(within(form).getByRole('button', { name: 'Nachtragen' }));

		expect(await screen.findByText('Projektzeit nachgetragen.')).toBeInTheDocument();
		expect(sent).toEqual([
			{
				projectId: '5e21b8d4-6a0f-4c37-8e92-000000000002',
				startedAt: '2026-09-24T05:00:00.000Z',
				endedAt: '2026-09-24T06:15:00.000Z',
				note: 'Lohnjournal abgestimmt'
			}
		]);
	});
});
