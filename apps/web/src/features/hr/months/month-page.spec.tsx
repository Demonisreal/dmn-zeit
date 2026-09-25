import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MonthChecklist } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { hrHandlers, resetMockHr, signedInAs } from '../../../mocks/hr';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/render-app';

const checklist = (changes: Partial<MonthChecklist>) =>
	http.get('/api/months/:month/checklist', ({ params }) =>
		HttpResponse.json({
			month: params.month,
			closed: false,
			closable: true,
			items: [],
			capPreview: [],
			...changes
		})
	);

beforeEach(() => {
	resetMockHr();
	server.use(...hrHandlers);
});

describe('month-end close', () => {
	it('keeps the close button off while a blocking point is open', async () => {
		server.use(signedInAs('hr'));
		renderApp('/hr/months/2026-08');

		const list = await screen.findByRole('list', { name: '' }).catch(() => null);
		const heading = await screen.findByRole('heading', { name: 'Checkliste' });
		expect(heading).toBeInTheDocument();
		expect(list).toBeDefined();
		expect(screen.getByText('Offene Korrekturanträge')).toBeInTheDocument();
		expect(screen.getByText('blockiert')).toBeInTheDocument();
		const openCorrections = screen.getByText('Offene Korrekturanträge').closest('li');
		expect(openCorrections).not.toBeNull();
		expect(
			within(openCorrections!).getByRole('link', { name: 'Im Posteingang entscheiden' })
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Monat abschließen' })).toBeDisabled();
		expect(
			screen.getByText('Erst abschließbar, wenn die blockierenden Punkte erledigt sind.')
		).toBeInTheDocument();
	});

	it('closes the month after the confirmation', async () => {
		let closed = false;
		server.use(
			signedInAs('hr'),
			checklist({}),
			http.post('/api/months/:month/close', () => {
				closed = true;
				return HttpResponse.json({
					id: 'a3f3f4a0-9b9e-4a5d-9f2a-0f7c8d5a1b3c',
					month: '2026-08',
					action: 'close',
					reason: null,
					actor: { id: '3f6c2a9e-8b1d-4c57-9e0a-5d2b7f4a1c38', displayName: 'Sabine Kortmann' },
					at: '2026-09-24T10:00:00Z',
					capped: []
				});
			})
		);
		renderApp('/hr/months/2026-08');

		await userEvent.click(await screen.findByRole('button', { name: 'Monat abschließen' }));
		const dialog = screen.getByRole('alertdialog', { name: 'August 2026 abschließen?' });
		expect(dialog).toHaveTextContent('bis einschließlich 31.08.2026');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Monat abschließen' }));

		await screen.findByRole('button', { name: 'Monat abschließen' });
		expect(closed).toBe(true);
		expect(screen.queryByRole('alertdialog')).toBeNull();
	});

	it('leaves reopening to administration and says so to hr', async () => {
		server.use(signedInAs('hr'));
		renderApp('/hr/months/2026-07');

		const reopen = await screen.findByRole('button', { name: 'Monat wieder öffnen' });

		expect(reopen).toBeDisabled();
		expect(reopen).toHaveAccessibleDescription(
			'Nur die Administration kann einen Monat wieder öffnen.'
		);
	});

	it('lets administration reopen the last closed month with a reason', async () => {
		let reason: unknown;
		server.use(
			signedInAs('admin'),
			http.post('/api/months/:month/reopen', async ({ request }) => {
				reason = await request.clone().json();
			})
		);
		renderApp('/hr/months/2026-07');

		await userEvent.click(await screen.findByRole('button', { name: 'Monat wieder öffnen' }));
		const dialog = screen.getByRole('alertdialog', { name: 'Juli 2026 wieder öffnen?' });
		await userEvent.type(
			within(dialog).getByLabelText('Begründung'),
			'Krankmeldung von Helin Demir kam verspätet'
		);
		await userEvent.click(within(dialog).getByRole('button', { name: 'Monat wieder öffnen' }));

		expect(await screen.findByRole('button', { name: 'Monat abschließen' })).toBeInTheDocument();
		expect(reason).toEqual({ reason: 'Krankmeldung von Helin Demir kam verspätet' });
	});

	it('asks for the sign-in again when the api wants a fresh confirmation', async () => {
		server.use(
			signedInAs('admin'),
			// once: true drops this override after the first hit, the retry then reaches the real handler
			http.post(
				'/api/months/:month/reopen',
				() =>
					HttpResponse.json(
						{ code: 'REAUTH_REQUIRED', message: 'Step-up needed', details: null },
						{ status: 403 }
					),
				{ once: true }
			),
			http.post('/api/auth/reauth', () =>
				HttpResponse.json({ reauthUntil: '2026-09-24T12:10:00+02:00' })
			)
		);
		renderApp('/hr/months/2026-07');

		await userEvent.click(await screen.findByRole('button', { name: 'Monat wieder öffnen' }));
		const dialog = screen.getByRole('alertdialog', { name: 'Juli 2026 wieder öffnen?' });
		await userEvent.type(within(dialog).getByLabelText('Begründung'), 'Nachträgliche Korrektur');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Monat wieder öffnen' }));

		const reauth = await screen.findByRole('dialog', { name: 'Erneut bestätigen' });
		await userEvent.type(within(reauth).getByLabelText('Passwort'), 'richtiges-passwort');
		await userEvent.type(within(reauth).getByLabelText('Code aus der Authenticator-App'), '123456');
		await userEvent.click(within(reauth).getByRole('button', { name: 'Bestätigen' }));

		expect(await screen.findByRole('button', { name: 'Monat abschließen' })).toBeInTheDocument();
	});

	it('offers a retry when the checklist cannot be loaded', async () => {
		server.use(
			signedInAs('hr'),
			http.get(
				'/api/months/:month/checklist',
				() =>
					HttpResponse.json({ code: 'FORBIDDEN', message: 'No', details: null }, { status: 403 }),
				{ once: true }
			)
		);
		renderApp('/hr/months/2026-08');

		expect(await screen.findByRole('alert')).toHaveTextContent('Das hat nicht geklappt.');
		expect(screen.queryByRole('button', { name: 'Monat abschließen' })).not.toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

		expect(await screen.findByRole('heading', { name: 'Checkliste' })).toBeInTheDocument();
	});
});
