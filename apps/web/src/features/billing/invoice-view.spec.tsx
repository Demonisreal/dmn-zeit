import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InvoiceLine } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { invoiceIds, signInForBilling } from './testing';

const issuedUrl = `/api/invoices/${invoiceIds.brinkmannIssued}`;

describe('invoice view', () => {
	it('downloads the PDF of a ZUGFeRD invoice and offers no XML', async () => {
		signInForBilling();
		const raw = await fetch(issuedUrl).then((res) => res.json());
		server.use(http.get(issuedUrl, () => HttpResponse.json({ ...raw, format: 'zugferd' })));
		renderApp(`/billing/invoices/${invoiceIds.brinkmannIssued}`);

		const pdf = await screen.findByRole('link', { name: 'PDF herunterladen' });
		expect(pdf).toHaveAttribute('href', `${issuedUrl}/document`);
		expect(pdf).toHaveAttribute('download');
		expect(screen.queryByRole('link', { name: 'XML herunterladen' })).not.toBeInTheDocument();
		expect(screen.queryByText(/Als XRechnung ausgestellt/)).not.toBeInTheDocument();
	});

	it('offers the XML of an XRechnung as the invoice and the PDF as a copy to read', async () => {
		signInForBilling();
		const raw = await fetch(issuedUrl).then((res) => res.json());
		server.use(http.get(issuedUrl, () => HttpResponse.json({ ...raw, format: 'xrechnung' })));
		renderApp(`/billing/invoices/${invoiceIds.brinkmannIssued}`);

		const xml = await screen.findByRole('link', { name: 'XML herunterladen' });
		const pdf = screen.getByRole('link', { name: 'PDF herunterladen' });
		const hint =
			'Als XRechnung ausgestellt: Die XML-Datei ist die Rechnung, die PDF nur eine Ansicht zum Lesen.';
		expect(xml).toHaveAttribute('href', `${issuedUrl}/xml`);
		expect(xml).toHaveAttribute('download');
		expect(xml).toHaveAccessibleDescription(hint);
		expect(pdf).toHaveAccessibleDescription(hint);
	});

	it('shows the reason of a tax-exempt position under its description', async () => {
		signInForBilling();
		const raw = await fetch(issuedUrl).then((res) => res.json());
		const course: InvoiceLine = {
			id: '6b0c4f2e-1a7d-4e93-8c25-000000000001',
			position: 1,
			kind: 'item',
			projectId: null,
			taskId: null,
			description: 'Präventionskurs',
			serviceFrom: null,
			serviceTo: null,
			minutes: null,
			quantityMilli: '1000',
			unit: 'C62',
			unitPriceCents: '15000',
			netCents: '15000',
			taxCategory: 'exempt',
			taxRateBp: 0,
			exemptionReason: '§ 4 Nr. 21 UStG',
			derivation: { entries: [], rounding: null, rate: null }
		};
		server.use(http.get(issuedUrl, () => HttpResponse.json({ ...raw, lines: [course] })));
		renderApp(`/billing/invoices/${invoiceIds.brinkmannIssued}`);

		const line = (await screen.findByText('Präventionskurs')).closest('li')!;
		expect(within(line).getByText('Steuerbefreiung: § 4 Nr. 21 UStG')).toBeInTheDocument();
	});

	it('shows an issued invoice with its PDF preview and payment action', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.brinkmannIssued}`);

		expect(await screen.findByText(/RE-\d{4}-0001/)).toBeInTheDocument();
		expect(screen.getByText('ausgestellt')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Als bezahlt markieren' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Zahlung zurücknehmen' })).not.toBeInTheDocument();
	});

	it('marks the invoice paid and can undo it again', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.brinkmannIssued}`);
		await screen.findByText(/RE-\d{4}-0001/);

		await userEvent.click(screen.getByRole('button', { name: 'Als bezahlt markieren' }));
		const dialog = await screen.findByRole('alertdialog');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Als bezahlt markieren' }));

		expect(await screen.findByText('bezahlt')).toBeInTheDocument();
		const undo = screen.getByRole('button', { name: 'Zahlung zurücknehmen' });

		await userEvent.click(undo);
		expect(await screen.findByText('ausgestellt')).toBeInTheDocument();
	});

	it('names a payment date in the future at the date field', async () => {
		server.use(
			http.post(`${issuedUrl}/paid`, () =>
				HttpResponse.json(
					{
						code: 'VALIDATION',
						message: 'Invalid input',
						details: [{ field: 'paidOn', code: 'custom', message: 'invoice.paidOnFuture' }]
					},
					{ status: 400 }
				)
			)
		);
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.brinkmannIssued}`);
		await screen.findByText(/RE-\d{4}-0001/);

		await userEvent.click(screen.getByRole('button', { name: 'Als bezahlt markieren' }));
		const dialog = await screen.findByRole('alertdialog');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Als bezahlt markieren' }));

		expect(
			await within(dialog).findByText('Das Zahlungsdatum liegt in der Zukunft')
		).toBeInTheDocument();
		expect(within(dialog).getByRole('group', { name: 'Bezahlt am' })).toHaveAccessibleDescription(
			/Das Zahlungsdatum liegt in der Zukunft/
		);
		expect(
			within(dialog).queryByText(/Die Angaben wurden nicht angenommen/)
		).not.toBeInTheDocument();
	});

	it('lists what the cancellation still lacks as an e-invoice', async () => {
		server.use(
			http.post(`${issuedUrl}/cancel`, () =>
				HttpResponse.json(
					{
						code: 'INVALID_STATE',
						message: 'This cancellation is missing required fields',
						details: { blockers: ['seller_contact_missing', 'buyer_reference_missing'] }
					},
					{ status: 409 }
				)
			)
		);
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.brinkmannIssued}`);
		await screen.findByText(/RE-\d{4}-0001/);

		await userEvent.click(screen.getByRole('button', { name: 'Stornieren' }));
		const dialog = await screen.findByRole('alertdialog');
		await userEvent.type(within(dialog).getByLabelText('Grund'), 'Falscher Leistungszeitraum');
		await userEvent.click(
			within(dialog).getByRole('button', { name: 'Stornorechnung ausstellen' })
		);

		const missing = within(await within(dialog).findByRole('alert')).getAllByRole('listitem');
		expect(missing.map((item) => item.textContent)).toEqual([
			'Für XRechnung fehlen in den Einstellungen Name, Telefon oder E-Mail der Kontaktperson.',
			'Für XRechnung fehlt beim Kunden die Käuferreferenz, bei Behörden die Leitweg-ID.'
		]);
		expect(
			within(dialog).queryByText(/Stand hat sich inzwischen geändert/)
		).not.toBeInTheDocument();
	});

	it('links a cancelled invoice to its cancellation invoice', async () => {
		signInForBilling();
		const raw = await fetch(issuedUrl).then((res) => res.json());
		const storno = '1f6a2e4c-8d9b-4a37-a05e-000000000009';
		server.use(
			http.get(issuedUrl, () =>
				HttpResponse.json({
					...raw,
					status: 'cancelled',
					cancellation: { id: storno, number: 'RE-2026-0009', issueDate: '2026-09-20' }
				})
			)
		);
		renderApp(`/billing/invoices/${invoiceIds.brinkmannIssued}`);

		expect(
			await screen.findByText(/Storniert durch Stornorechnung RE-2026-0009\./)
		).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Anzeigen' })).toHaveAttribute(
			'href',
			`/billing/invoices/${storno}`
		);
		expect(screen.queryByText(/Stornorechnung zu/)).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Stornieren' })).not.toBeInTheDocument();
	});

	it('requires a reason of at least 10 characters before a cancellation invoice can be issued', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.brinkmannIssued}`);
		await screen.findByText(/RE-\d{4}-0001/);

		await userEvent.click(screen.getByRole('button', { name: 'Stornieren' }));
		const dialog = await screen.findByRole('alertdialog');
		const confirm = within(dialog).getByRole('button', { name: 'Stornorechnung ausstellen' });
		expect(confirm).toBeDisabled();

		await userEvent.type(within(dialog).getByLabelText('Grund'), 'Falscher Leistungszeitraum');
		expect(confirm).not.toBeDisabled();
		await userEvent.click(confirm);

		expect(await screen.findByText('storniert')).toBeInTheDocument();
		expect(screen.getByText(/Storniert durch Stornorechnung RE-\d{4}-\d{4}\./)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Anzeigen' })).toBeInTheDocument();
	});
});
