import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Invoice, IssueInvoiceInput } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { addHostingLine, invoiceIds, signInForBilling } from './testing';

const draftUrl = `/api/invoices/${invoiceIds.yilmazDraft}`;

async function storedAs(patch: Partial<Invoice>) {
	await addHostingLine(invoiceIds.yilmazDraft);
	const raw = (await fetch(draftUrl).then((res) => res.json())) as Invoice;
	server.use(http.get(draftUrl, () => HttpResponse.json({ ...raw, ...patch }), { once: true }));
}

const openDialog = async () => {
	await userEvent.click(await screen.findByRole('button', { name: 'Ausstellen' }));
	return screen.findByRole('alertdialog', { name: 'Rechnung ausstellen' });
};

describe('issue dialog', () => {
	it('offers every format and starts from the one stored on the draft', async () => {
		signInForBilling();
		await storedAs({ format: 'zugferd' });
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		const dialog = await openDialog();
		const pdf = within(dialog).getByRole('radio', { name: 'PDF' });
		const zugferd = within(dialog).getByRole('radio', { name: 'ZUGFeRD' });
		const xrechnung = within(dialog).getByRole('radio', { name: 'XRechnung' });

		expect(zugferd).toBeChecked();
		expect(pdf).toBeEnabled();
		expect(xrechnung).toBeEnabled();
		expect(pdf).toHaveAccessibleDescription('Nur PDF, ohne E-Rechnung');
		expect(zugferd).toHaveAccessibleDescription('PDF mit eingebetteter E-Rechnung');
		expect(xrechnung).toHaveAccessibleDescription('XML für öffentliche Auftraggeber');
		expect(within(dialog).queryByText(/folgt in einer späteren Version/)).not.toBeInTheDocument();
	});

	it('lists what an e-invoice lacks, keeps the dialog open and lets another format go through', async () => {
		signInForBilling();
		await storedAs({ format: 'xrechnung' });
		const sent: string[] = [];
		server.use(
			http.post(`${draftUrl}/issue`, async ({ request }) => {
				const { format } = (await request.clone().json()) as IssueInvoiceInput;
				sent.push(format);
				if (format !== 'xrechnung') return undefined;
				return HttpResponse.json(
					{
						code: 'INVALID_STATE',
						message: 'E-invoice details missing',
						details: { blockers: ['buyer_reference_missing', 'seller_contact_missing'] }
					},
					{ status: 409 }
				);
			})
		);
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		const dialog = await openDialog();
		expect(within(dialog).getByRole('radio', { name: 'XRechnung' })).toBeChecked();
		const confirm = within(dialog).getByRole('button', { name: 'Jetzt ausstellen' });
		await userEvent.click(confirm);

		const missing = within(await within(dialog).findByRole('alert')).getAllByRole('listitem');
		expect(missing.map((item) => item.textContent)).toEqual([
			'Für XRechnung fehlt beim Kunden die Käuferreferenz, bei Behörden die Leitweg-ID.',
			'Für XRechnung fehlen in den Einstellungen Name, Telefon oder E-Mail der Kontaktperson.'
		]);
		expect(
			within(dialog).queryByText(/Stand hat sich inzwischen geändert/)
		).not.toBeInTheDocument();
		expect(confirm).toHaveFocus();
		expect(confirm).toHaveAttribute('aria-disabled', 'false');
		expect(confirm).toHaveAccessibleDescription(/Käuferreferenz/);

		await userEvent.click(within(dialog).getByRole('radio', { name: 'PDF' }));
		expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
		await userEvent.click(confirm);

		expect(await screen.findByRole('heading', { name: /RE-\d{4}-0003/ })).toBeInTheDocument();
		expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
		expect(sent).toEqual(['xrechnung', 'pdf']);
	});

	it('warns first, shows the service period and holds back a format with gaps', async () => {
		signInForBilling();
		await storedAs({
			format: 'xrechnung',
			blockers: ['iban_missing'],
			serviceFrom: '2026-09-01',
			serviceTo: '2026-09-24'
		});
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		const dialog = await openDialog();
		const warning = within(dialog).getByText(
			'Die Rechnung erhält jetzt eine Nummer und kann danach nicht mehr geändert werden.'
		);
		const client = within(dialog).getByText('Kunde');
		expect(warning.compareDocumentPosition(client) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(within(dialog).getByText('Leistungszeitraum')).toBeInTheDocument();
		expect(within(dialog).getByText('01.09.2026 – 24.09.2026')).toBeInTheDocument();

		const confirm = within(dialog).getByRole('button', { name: 'Jetzt ausstellen' });
		expect(
			within(dialog).getByText('Für XRechnung fehlt in den Einstellungen die IBAN.')
		).toBeInTheDocument();
		expect(confirm).toHaveAttribute('aria-disabled', 'true');
		expect(confirm).toHaveAccessibleDescription(
			'Für XRechnung fehlt in den Einstellungen die IBAN.'
		);
		await userEvent.click(confirm);
		expect(dialog).toBeInTheDocument();

		await userEvent.click(within(dialog).getByRole('radio', { name: 'PDF' }));
		expect(confirm).toHaveAttribute('aria-disabled', 'false');
	});

	it('asks to confirm a timer of twelve hours and more before the number goes out', async () => {
		signInForBilling();
		await storedAs({ hints: ['long_timer_entry'] });
		const sent: IssueInvoiceInput[] = [];
		server.use(
			http.post(`${draftUrl}/issue`, async ({ request }) => {
				const input = (await request.clone().json()) as IssueInvoiceInput;
				sent.push(input);
				if (input.longTimersChecked) return undefined;
				return HttpResponse.json(
					{
						code: 'INVALID_STATE',
						message: 'This invoice is missing required fields',
						details: { blockers: ['long_timer_entry'] }
					},
					{ status: 409 }
				);
			})
		);
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		const dialog = await openDialog();
		const checked = within(dialog).getByRole('checkbox', {
			name: 'Timer-Einträge ab 12 Stunden geprüft, die Zeit stimmt'
		});
		expect(checked).not.toBeChecked();
		await userEvent.click(within(dialog).getByRole('button', { name: 'Jetzt ausstellen' }));
		expect(await within(dialog).findByRole('alert')).toHaveTextContent(
			'Ein Timer-Eintrag lief 12 Stunden oder länger.'
		);

		await userEvent.click(checked);
		expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
		await userEvent.click(within(dialog).getByRole('button', { name: 'Jetzt ausstellen' }));

		expect(await screen.findByRole('heading', { name: /RE-\d{4}-\d{4}/ })).toBeInTheDocument();
		expect(sent.map((input) => input.longTimersChecked)).toEqual([false, true]);
	});

	it('shows no confirmation for a draft without long timers', async () => {
		signInForBilling();
		await storedAs({ hints: [] });
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		const dialog = await openDialog();
		expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
	});

	it('ticks the invoice step of the freelancer tour in the demo', async () => {
		const session = signInForBilling('solo');
		server.use(
			http.get('/api/auth/session', () =>
				HttpResponse.json({
					...session,
					mode: 'demo',
					tenant: {
						...session.tenant,
						kind: 'sandbox',
						expiresAt: new Date(Date.now() + 3_600_000).toISOString()
					}
				})
			)
		);
		await addHostingLine(invoiceIds.yilmazDraft);
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);
		expect(await screen.findByRole('button', { name: 'Rundgang 0 von 1' })).toBeInTheDocument();

		const dialog = await openDialog();
		await userEvent.click(within(dialog).getByRole('button', { name: 'Jetzt ausstellen' }));

		expect(await screen.findByRole('button', { name: 'Rundgang 1 von 1' })).toBeInTheDocument();
	});
});
