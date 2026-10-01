import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { clientIds, signInForBilling } from './testing';

describe('new invoice', () => {
	it('holds back a period longer than 366 days at the end date', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/new?client=${clientIds.hagen}&from=2025-01-01&to=2026-01-02`);

		expect(await screen.findByText('Höchstens 366 Tage')).toBeInTheDocument();
		expect(screen.getByRole('group', { name: 'Bis' })).toHaveAccessibleDescription(
			/Höchstens 366 Tage/
		);
		expect(screen.getByRole('button', { name: 'Entwurf erstellen' })).toBeDisabled();
	});

	it('says there is nothing to bill when the api finds no time with a rate', async () => {
		server.use(
			http.post('/api/invoices/drafts', () =>
				HttpResponse.json(
					{ code: 'INVALID_STATE', message: 'No unbilled time in this period', details: null },
					{ status: 409 }
				)
			)
		);
		signInForBilling();
		renderApp(`/billing/invoices/new?client=${clientIds.hagen}`);

		await userEvent.click(await screen.findByRole('button', { name: 'Entwurf erstellen' }));

		expect(
			await screen.findByText('Im Zeitraum gibt es keine abrechenbare Zeit mit hinterlegtem Satz.')
		).toBeInTheDocument();
		expect(screen.queryByText(/Stand hat sich inzwischen geändert/)).not.toBeInTheDocument();
	});

	it('names the line limit when the period would bring too many positions', async () => {
		server.use(
			http.post('/api/invoices/drafts', () =>
				HttpResponse.json(
					{
						code: 'VALIDATION',
						message: 'Invalid input',
						details: [
							{
								field: 'lines',
								code: 'custom',
								message: 'invoice.tooManyLines',
								params: { max: 500 }
							}
						]
					},
					{ status: 400 }
				)
			)
		);
		signInForBilling();
		renderApp(`/billing/invoices/new?client=${clientIds.hagen}`);

		await userEvent.click(await screen.findByRole('button', { name: 'Entwurf erstellen' }));

		expect(await screen.findByText('Höchstens 500 Positionen')).toBeInTheDocument();
	});
});
