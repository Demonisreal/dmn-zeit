import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { clientIds, signInForBilling } from './testing';

afterEach(() => vi.useRealTimers());

describe('new invoice', () => {
	it('takes the berlin date for the default period, also shortly after midnight', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-31T23:30:00Z'));
		let period: unknown;
		server.use(
			http.post('/api/invoices/drafts', async ({ request }) => {
				period = await request.json();
				return HttpResponse.json(
					{ code: 'INVALID_STATE', message: 'No unbilled time in this period', details: null },
					{ status: 409 }
				);
			})
		);
		signInForBilling();
		renderApp(`/billing/invoices/new?client=${clientIds.hagen}`);

		await userEvent.click(await screen.findByRole('button', { name: 'Entwurf erstellen' }));

		await screen.findByText('Im Zeitraum gibt es keine abrechenbare Zeit mit hinterlegtem Satz.');
		expect(period).toEqual({ clientId: clientIds.hagen, from: '2026-11-01', to: '2026-11-01' });
	});

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

	describe('period start from the unbilled time', () => {
		let period: unknown;
		const refuseDraft = () =>
			server.use(
				http.post('/api/invoices/drafts', async ({ request }) => {
					period = await request.json();
					return HttpResponse.json(
						{ code: 'INVALID_STATE', message: 'No unbilled time in this period', details: null },
						{ status: 409 }
					);
				})
			);
		const draftPeriod = async () => {
			await userEvent.click(screen.getByRole('button', { name: 'Entwurf erstellen' }));
			await screen.findByText('Im Zeitraum gibt es keine abrechenbare Zeit mit hinterlegtem Satz.');
			return period;
		};

		it('moves the start back to the oldest open day when coming from a client', async () => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
			refuseDraft();
			signInForBilling();
			renderApp(`/billing/invoices/new?client=${clientIds.brinkmann}`);

			await screen.findByText('Ältester Tag');
			expect(screen.queryByText(/außerhalb des Zeitraums/)).not.toBeInTheDocument();
			expect(await draftPeriod()).toEqual({
				clientId: clientIds.brinkmann,
				from: '2026-08-24',
				to: '2026-09-24'
			});
		});

		it('stops at 366 days before the end', async () => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
			refuseDraft();
			server.use(
				http.get('/api/billing/unbilled', () =>
					HttpResponse.json([
						{
							clientId: clientIds.brinkmann,
							clientName: 'Autohaus Brinkmann KG (Beispiel)',
							minutes: 60,
							amountCents: '11000',
							oldestDay: '2025-01-10'
						}
					])
				)
			);
			signInForBilling();
			renderApp(`/billing/invoices/new?client=${clientIds.brinkmann}`);

			expect(
				await screen.findByText('Ältere offene Zeiten ab 10.01. liegen außerhalb des Zeitraums.')
			).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: /^Ab / })).not.toBeInTheDocument();
			expect(await draftPeriod()).toMatchObject({ from: '2025-09-24', to: '2026-09-24' });
		});

		it('keeps a chosen start and offers the older time with one press', async () => {
			refuseDraft();
			signInForBilling();
			renderApp(
				`/billing/invoices/new?client=${clientIds.brinkmann}&from=2026-09-01&to=2026-09-24`
			);

			expect(
				await screen.findByText('Ältere offene Zeiten ab 24.08. liegen außerhalb des Zeitraums.')
			).toBeInTheDocument();
			await userEvent.click(screen.getByRole('button', { name: 'Ab 24.08.' }));

			expect(screen.queryByText(/außerhalb des Zeitraums/)).not.toBeInTheDocument();
			expect(await draftPeriod()).toMatchObject({ from: '2026-08-24', to: '2026-09-24' });
		});
	});
});
