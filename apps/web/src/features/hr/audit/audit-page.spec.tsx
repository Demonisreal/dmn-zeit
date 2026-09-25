import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuditEntry } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { hrHandlers, mockEmployees, resetMockHr, signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';

const frank = mockEmployees.find((employee) => employee.lastName === 'Oberdiek')!;

const entry = (id: string, fields: Partial<AuditEntry>): AuditEntry => ({
	id,
	occurredAt: '2026-09-22T15:12:00Z',
	actorUserId: null,
	actorName: 'Sabine Kortmann',
	actorRole: 'hr',
	source: 'trigger',
	action: 'update',
	table: 'time_entries',
	rowId: null,
	subjectEmployeeId: frank.id,
	changes: null,
	context: null,
	requestId: null,
	ip: null,
	...fields
});

const entries = [
	entry('2', {
		changes: { ended_at: [null, '2026-09-22T17:10:00+02:00'], end_reason: [null, 'leave'] }
	}),
	entry('1', {
		actorName: 'Mara Lenz',
		actorRole: 'admin',
		source: 'app',
		action: 'login_success',
		table: null,
		subjectEmployeeId: null,
		context: { method: 'passkey' },
		ip: '203.0.113.24'
	})
];

const cells = (row: HTMLElement) =>
	within(row)
		.getAllByRole('cell')
		.map((cell) => cell.textContent);

beforeEach(() => {
	resetMockHr();
	server.use(signedInAs('hr'), ...hrHandlers);
});

describe('audit log', () => {
	it('opens before and after for a changed row', async () => {
		server.use(
			http.get('/api/audit', () => HttpResponse.json({ items: entries, nextCursor: null }))
		);
		renderApp('/hr/audit');
		const table = await screen.findByRole('table', { name: 'Änderungsprotokoll' });
		const changed = within(table).getByRole('row', { name: /Frank Oberdiek/ });

		await userEvent.click(within(changed).getByRole('button', { name: '2 Felder' }));

		expect(within(changed).getByRole('button', { name: '2 Felder' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		expect(screen.getByRole('columnheader', { name: 'Vorher' })).toBeInTheDocument();
		expect(cells(screen.getByRole('row', { name: /^end_reason/ }))).toEqual(['–', 'leave']);
	});

	it('shows the context of a login without before and after', async () => {
		server.use(
			http.get('/api/audit', () => HttpResponse.json({ items: entries, nextCursor: null }))
		);
		renderApp('/hr/audit');
		const table = await screen.findByRole('table', { name: 'Änderungsprotokoll' });
		const login = within(table).getByRole('row', { name: /login_success/ });

		await userEvent.click(within(login).getByRole('button', { name: '1 Feld' }));

		expect(screen.getByText('method').nextElementSibling).toHaveTextContent('passkey');
		expect(screen.queryByRole('columnheader', { name: 'Vorher' })).not.toBeInTheDocument();
	});

	it('offers a retry when the log cannot be loaded', async () => {
		server.use(
			http.get(
				'/api/audit',
				() =>
					HttpResponse.json({ code: 'FORBIDDEN', message: 'No', details: null }, { status: 403 }),
				{ once: true }
			)
		);
		renderApp('/hr/audit?from=2026-09-01&to=2026-09-24');

		expect(await screen.findByRole('alert')).toHaveTextContent('Das hat nicht geklappt.');
		await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

		expect(await screen.findByRole('table', { name: 'Änderungsprotokoll' })).toBeInTheDocument();
	});
});
