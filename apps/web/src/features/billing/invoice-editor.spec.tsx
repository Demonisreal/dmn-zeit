import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { addHostingLine, invoiceIds, signInForBilling } from './testing';

const draftUrl = `/api/invoices/${invoiceIds.yilmazDraft}`;

const chooseTax = async (form: HTMLElement, category: string) => {
	await userEvent.click(within(form).getByRole('button', { name: /Steuersatz/ }));
	await userEvent.click(await screen.findByRole('option', { name: category }));
};

describe('invoice editor', () => {
	it('shows the draft with an empty position list', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		expect(
			await screen.findByRole('heading', { name: 'Praxis Dr. Yilmaz (Beispiel)' })
		).toBeInTheDocument();
		expect(screen.getByText('Noch keine Positionen für diesen Zeitraum.')).toBeInTheDocument();
		const issue = screen.getByRole('button', { name: 'Ausstellen' });
		expect(issue).toBeDisabled();
		expect(issue).toHaveAccessibleDescription(
			'Ohne Position lässt sich die Rechnung nicht ausstellen.'
		);
		expect(
			screen.getByText('Ohne Position lässt sich die Rechnung nicht ausstellen.')
		).toBeVisible();
		expect(screen.getByRole('button', { name: 'Zeiten neu einlesen' })).toBeInTheDocument();
	});

	it('adds a free position and totals it into the issue confirmation', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);
		await screen.findByRole('heading', { name: 'Praxis Dr. Yilmaz (Beispiel)' });

		await userEvent.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
		const form = screen.getByRole('form', { name: 'Position hinzufügen' });
		await userEvent.type(within(form).getByLabelText('Beschreibung'), 'Hosting-Pauschale');
		await userEvent.clear(within(form).getByLabelText('Menge'));
		await userEvent.type(within(form).getByLabelText('Menge'), '2');
		await userEvent.type(within(form).getByLabelText('Einzelpreis'), '50');
		await userEvent.click(within(form).getByRole('button', { name: 'Position hinzufügen' }));

		expect(await screen.findByText('Hosting-Pauschale')).toBeInTheDocument();
		expect(screen.getByText('100,00 €')).toBeInTheDocument();

		const issueButton = screen.getByRole('button', { name: 'Ausstellen' });
		expect(issueButton).not.toBeDisabled();
		await userEvent.click(issueButton);

		const dialog = await screen.findByRole('alertdialog', { name: 'Rechnung ausstellen' });
		expect(within(dialog).getByText('119,00 €')).toBeInTheDocument();
		expect(
			within(dialog).getByText(
				'Die Rechnung erhält jetzt eine Nummer und kann danach nicht mehr geändert werden.'
			)
		).toBeInTheDocument();
		expect(within(dialog).getByRole('radio', { name: 'PDF' })).toBeChecked();
	});

	it('names where an e-invoice detail is missing and still opens the dialog to pick another format', async () => {
		signInForBilling();
		await addHostingLine(invoiceIds.yilmazDraft);
		const raw = await fetch(`/api/invoices/${invoiceIds.yilmazDraft}`).then((res) => res.json());
		server.use(
			http.get(`/api/invoices/${invoiceIds.yilmazDraft}`, () =>
				HttpResponse.json({
					...raw,
					format: 'xrechnung',
					blockers: ['buyer_reference_missing', 'seller_contact_missing']
				})
			)
		);
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		const buyer = await screen.findByText(
			/Für XRechnung fehlt beim Kunden die Käuferreferenz, bei Behörden die Leitweg-ID\./
		);
		const blockers = buyer.closest('ul')!;
		expect(within(blockers).getByRole('link', { name: 'Kunde' })).toHaveAttribute(
			'href',
			`/billing/clients/${raw.clientId}`
		);
		expect(within(blockers).getByRole('link', { name: 'Einstellungen' })).toHaveAttribute(
			'href',
			'/billing/settings'
		);

		const issueButton = screen.getByRole('button', { name: 'Ausstellen' });
		expect(issueButton).toBeEnabled();
		await userEvent.click(issueButton);

		const dialog = await screen.findByRole('alertdialog', { name: 'Rechnung ausstellen' });
		expect(within(dialog).getByRole('radio', { name: 'XRechnung' })).toBeChecked();
		expect(within(dialog).getByText(/Käuferreferenz/)).toBeInTheDocument();

		await userEvent.click(within(dialog).getByRole('radio', { name: 'ZUGFeRD' }));
		expect(within(dialog).queryByText(/Käuferreferenz/)).not.toBeInTheDocument();
	});

	it('takes the full range of quantity and unit price the api accepts, a discount included', async () => {
		let sent: unknown;
		server.use(
			http.post(`/api/invoices/${invoiceIds.yilmazDraft}/lines`, async ({ request }) => {
				sent = await request.clone().json();
			})
		);
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);
		await screen.findByRole('heading', { name: 'Praxis Dr. Yilmaz (Beispiel)' });

		await userEvent.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
		const form = screen.getByRole('form', { name: 'Position hinzufügen' });
		const quantity = within(form).getByLabelText('Menge');
		const price = within(form).getByLabelText('Einzelpreis');
		await userEvent.type(within(form).getByLabelText('Beschreibung'), 'Nachlass');
		await userEvent.clear(quantity);
		await userEvent.type(quantity, '1000000');
		await userEvent.type(price, '-10000000');
		await userEvent.click(within(form).getByRole('button', { name: 'Position hinzufügen' }));

		expect(quantity).toHaveAccessibleDescription(
			'Menge größer als 0 und bis 999.999,999, mit bis zu drei Nachkommastellen'
		);
		expect(price).toHaveAccessibleDescription(
			/Betrag bis ±9\.999\.999,99 €, mit bis zu zwei Nachkommastellen/
		);
		expect(sent).toBeUndefined();

		await userEvent.clear(quantity);
		await userEvent.type(quantity, '999999,999');
		await userEvent.clear(price);
		await userEvent.type(price, '-9999999,99');
		await userEvent.click(within(form).getByRole('button', { name: 'Position hinzufügen' }));

		expect(await screen.findByText('Nachlass')).toBeInTheDocument();
		expect(sent).toMatchObject({ quantityMilli: '999999999', unitPriceCents: '-999999999' });
	});

	it('shows the hints of a draft without holding back the issue', async () => {
		signInForBilling();
		await addHostingLine(invoiceIds.yilmazDraft);
		const raw = await fetch(`/api/invoices/${invoiceIds.yilmazDraft}`).then((res) => res.json());
		server.use(
			http.get(`/api/invoices/${invoiceIds.yilmazDraft}`, () =>
				HttpResponse.json({ ...raw, hints: ['public_buyer_wants_xrechnung', 'long_timer_entry'] })
			)
		);
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		expect(
			await screen.findByText(/Öffentliche Auftraggeber erwarten eine XRechnung/)
		).toBeInTheDocument();
		expect(
			screen.getByText(/Timer-Eintrag dieser Rechnung lief 12 Stunden oder länger/)
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Ausstellen' })).toBeEnabled();
	});

	it.each([
		['seller_address_incomplete', /fehlen Straße, PLZ oder Ort des Rechnungsstellers/],
		['tax_profile_mismatch', /Steuerprofil der Rechnung weicht/],
		['tax_treatment_stale', /steuerliche Behandlung der Rechnung passt nicht mehr/],
		['tax_category_mismatch', /Steuerkategorie, die zu dieser Rechnung nicht passt/],
		['tax_rate_mismatch', /Steuersatz einer Position weicht/],
		['total_negative', /Rechnungssumme ist negativ/],
		['total_too_large', /Rechnungssumme ist zu groß/]
	])('keeps issuing closed for %s, whatever format gets picked', async (blocker, text) => {
		signInForBilling();
		await addHostingLine(invoiceIds.yilmazDraft);
		const raw = await fetch(`/api/invoices/${invoiceIds.yilmazDraft}`).then((res) => res.json());
		server.use(
			http.get(`/api/invoices/${invoiceIds.yilmazDraft}`, () =>
				HttpResponse.json({ ...raw, format: 'xrechnung', blockers: [blocker] })
			)
		);
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		expect(await screen.findByText(text)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Ausstellen' })).toBeDisabled();
	});

	it('points a stale tax treatment to reloading the booked time and a missing VAT ID to the client', async () => {
		signInForBilling();
		await addHostingLine(invoiceIds.yilmazDraft);
		const raw = await fetch(draftUrl).then((res) => res.json());
		let refreshed = 0;
		server.use(
			http.get(draftUrl, () =>
				HttpResponse.json({
					...raw,
					format: 'zugferd',
					blockers: ['tax_treatment_stale', 'buyer_vat_id_missing']
				})
			),
			http.post(`${draftUrl}/refresh`, () => {
				refreshed += 1;
				return HttpResponse.json(raw);
			})
		);
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		const stale = (await screen.findByText(/steuerliche Behandlung/)).closest('li')!;
		const vatId = screen.getByText(/Für Reverse Charge fehlt/).closest('li')!;
		expect(within(vatId).getByRole('link', { name: 'Kunde' })).toHaveAttribute(
			'href',
			`/billing/clients/${raw.clientId}`
		);
		expect(screen.getByRole('button', { name: 'Ausstellen' })).toBeDisabled();
		await userEvent.click(within(stale).getByRole('button', { name: 'Zeiten neu einlesen' }));
		await waitFor(() => expect(refreshed).toBe(1));
	});

	it('lets an XRechnung up to 250 € without the client address go out as PDF', async () => {
		signInForBilling();
		await addHostingLine(invoiceIds.yilmazDraft);
		const raw = await fetch(draftUrl).then((res) => res.json());
		server.use(
			http.get(
				draftUrl,
				() =>
					HttpResponse.json({
						...raw,
						format: 'xrechnung',
						blockers: ['buyer_address_incomplete']
					}),
				{ once: true }
			)
		);
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		const issueButton = await screen.findByRole('button', { name: 'Ausstellen' });
		expect(screen.getByText(/Beim Kunden fehlen Straße, PLZ oder Ort/)).toBeInTheDocument();
		expect(issueButton).toBeEnabled();
		await userEvent.click(issueButton);

		const dialog = await screen.findByRole('alertdialog', { name: 'Rechnung ausstellen' });
		expect(within(dialog).getByRole('radio', { name: 'XRechnung' })).toBeChecked();
		expect(within(dialog).getByText(/Beim Kunden fehlen Straße, PLZ oder Ort/)).toBeInTheDocument();
		await userEvent.click(within(dialog).getByRole('radio', { name: 'PDF' }));
		expect(within(dialog).queryByText(/Beim Kunden fehlen Straße/)).not.toBeInTheDocument();
		await userEvent.click(within(dialog).getByRole('button', { name: 'Jetzt ausstellen' }));

		expect(await screen.findByRole('heading', { name: /RE-\d{4}-0003/ })).toBeInTheDocument();
	});

	it.each(['pdf', 'xrechnung'])(
		'keeps issuing closed for a missing client address above 250 € stored as %s',
		async (format) => {
			signInForBilling();
			await addHostingLine(invoiceIds.yilmazDraft);
			const raw = await fetch(draftUrl).then((res) => res.json());
			server.use(
				http.get(draftUrl, () =>
					HttpResponse.json({
						...raw,
						format,
						blockers: ['buyer_address_incomplete'],
						totals: { ...raw.totals, grossCents: '25001' }
					})
				)
			);
			renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

			expect(
				await screen.findByText(/Beim Kunden fehlen Straße, PLZ oder Ort/)
			).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Ausstellen' })).toBeDisabled();
		}
	);

	it('asks for the reason of a tax exemption and sends it only with that category', async () => {
		let sent: unknown;
		server.use(
			http.post(`${draftUrl}/lines`, async ({ request }) => {
				sent = await request.clone().json();
			})
		);
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);
		await screen.findByRole('heading', { name: 'Praxis Dr. Yilmaz (Beispiel)' });

		await userEvent.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
		const form = screen.getByRole('form', { name: 'Position hinzufügen' });
		await userEvent.type(within(form).getByLabelText('Beschreibung'), 'Präventionskurs');
		await userEvent.type(within(form).getByLabelText('Einzelpreis'), '150');
		expect(within(form).queryByLabelText('Grund der Steuerbefreiung')).not.toBeInTheDocument();

		await chooseTax(form, 'Steuerfrei');
		const reason = within(form).getByLabelText('Grund der Steuerbefreiung');
		expect(reason).toHaveAccessibleDescription('Mit Fundstelle, zum Beispiel § 4 Nr. 21 UStG');
		await userEvent.click(within(form).getByRole('button', { name: 'Position hinzufügen' }));

		expect(reason).toBeInvalid();
		expect(reason).toHaveAccessibleDescription(/Dieses Feld darf nicht leer sein/);
		expect(sent).toBeUndefined();

		await userEvent.type(reason, '§ 4 Nr. 21 UStG');
		await chooseTax(form, 'Standardsatz');
		expect(within(form).queryByLabelText('Grund der Steuerbefreiung')).not.toBeInTheDocument();
		await chooseTax(form, 'Steuerfrei');
		expect(within(form).getByLabelText('Grund der Steuerbefreiung')).toHaveValue('§ 4 Nr. 21 UStG');
		await userEvent.click(within(form).getByRole('button', { name: 'Position hinzufügen' }));

		expect(await screen.findByText('Steuerbefreiung: § 4 Nr. 21 UStG')).toBeInTheDocument();
		expect(sent).toMatchObject({ taxCategory: 'exempt', exemptionReason: '§ 4 Nr. 21 UStG' });
	});

	it('leaves a typed reason out once another category is picked', async () => {
		let sent: unknown;
		server.use(
			http.post(`${draftUrl}/lines`, async ({ request }) => {
				sent = await request.clone().json();
			})
		);
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);
		await screen.findByRole('heading', { name: 'Praxis Dr. Yilmaz (Beispiel)' });

		await userEvent.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
		const form = screen.getByRole('form', { name: 'Position hinzufügen' });
		await userEvent.type(within(form).getByLabelText('Beschreibung'), 'Fachbuch');
		await userEvent.type(within(form).getByLabelText('Einzelpreis'), '40');
		await chooseTax(form, 'Steuerfrei');
		await userEvent.type(
			within(form).getByLabelText('Grund der Steuerbefreiung'),
			'§ 4 Nr. 21 UStG'
		);
		await chooseTax(form, 'Ermäßigt');
		await userEvent.click(within(form).getByRole('button', { name: 'Position hinzufügen' }));

		expect(await screen.findByText('Fachbuch')).toBeInTheDocument();
		expect(sent).toMatchObject({ taxCategory: 'reduced' });
		expect(sent).not.toHaveProperty('exemptionReason');
		expect(screen.queryByText(/Steuerbefreiung:/)).not.toBeInTheDocument();
	});

	it('keeps the reason of an exempt position while editing and drops it with the category', async () => {
		signInForBilling();
		await fetch(`${draftUrl}/lines`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				description: 'Präventionskurs',
				quantityMilli: '1000',
				unit: 'C62',
				unitPriceCents: '15000',
				taxCategory: 'exempt',
				exemptionReason: '§ 4 Nr. 21 UStG'
			})
		});
		const patches: unknown[] = [];
		server.use(
			http.patch(`${draftUrl}/lines/:lineId`, async ({ request }) => {
				patches.push(await request.clone().json());
			})
		);
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		expect(await screen.findByText('Steuerbefreiung: § 4 Nr. 21 UStG')).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: '„Präventionskurs“ bearbeiten' }));
		const form = screen.getByRole('form', { name: 'Position bearbeiten' });
		expect(within(form).getByLabelText('Grund der Steuerbefreiung')).toHaveValue('§ 4 Nr. 21 UStG');

		await chooseTax(form, 'Standardsatz');
		await userEvent.click(within(form).getByRole('button', { name: 'Speichern' }));

		await waitFor(() => expect(screen.queryByText(/Steuerbefreiung:/)).not.toBeInTheDocument());
		expect(patches).toHaveLength(1);
		expect(patches[0]).toMatchObject({ taxCategory: 'standard' });
		expect(patches[0]).not.toHaveProperty('exemptionReason');
	});

	it('puts a refused reason at its field, or at the category once the field is gone', async () => {
		const refuse = (message: string) =>
			HttpResponse.json(
				{
					code: 'VALIDATION',
					message: 'Invalid input',
					details: [{ field: 'exemptionReason', code: 'custom', message }]
				},
				{ status: 400 }
			);
		server.use(
			http.post(`${draftUrl}/lines`, async ({ request }) => {
				const { taxCategory } = (await request.clone().json()) as { taxCategory: string };
				return refuse(
					taxCategory === 'exempt'
						? 'invoice.exemptionReasonRequired'
						: 'invoice.exemptionReasonUnexpected'
				);
			})
		);
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);
		await screen.findByRole('heading', { name: 'Praxis Dr. Yilmaz (Beispiel)' });

		await userEvent.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
		const form = screen.getByRole('form', { name: 'Position hinzufügen' });
		await userEvent.type(within(form).getByLabelText('Beschreibung'), 'Präventionskurs');
		await userEvent.type(within(form).getByLabelText('Einzelpreis'), '150');
		await chooseTax(form, 'Steuerfrei');
		const reason = within(form).getByLabelText('Grund der Steuerbefreiung');
		await userEvent.type(reason, '§ 4 Nr. 21 UStG');
		await userEvent.click(within(form).getByRole('button', { name: 'Position hinzufügen' }));

		const required = 'Für steuerfreie Positionen fehlt der Grund der Steuerbefreiung';
		await waitFor(() => expect(reason).toHaveAccessibleDescription(new RegExp(required)));
		expect(reason).toHaveFocus();
		expect(within(form).queryByRole('alert')).not.toBeInTheDocument();

		await chooseTax(form, 'Standardsatz');
		await userEvent.click(within(form).getByRole('button', { name: 'Position hinzufügen' }));

		const unexpected = 'Bei dieser Steuerkategorie ist kein Befreiungsgrund erlaubt';
		expect(await within(form).findByText(unexpected)).toBeInTheDocument();
		expect(within(form).getByRole('button', { name: /Steuersatz/ })).toHaveAccessibleDescription(
			unexpected
		);
		expect(within(form).queryByRole('alert')).not.toBeInTheDocument();
	});

	it('names the line limit when the api refuses one more position', async () => {
		server.use(
			http.post(`${draftUrl}/lines`, () =>
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
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);
		await screen.findByRole('heading', { name: 'Praxis Dr. Yilmaz (Beispiel)' });

		await userEvent.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
		const form = screen.getByRole('form', { name: 'Position hinzufügen' });
		await userEvent.type(within(form).getByLabelText('Beschreibung'), 'Hosting-Pauschale');
		await userEvent.type(within(form).getByLabelText('Einzelpreis'), '50');
		await userEvent.click(within(form).getByRole('button', { name: 'Position hinzufügen' }));

		expect(await within(form).findByText('Höchstens 500 Positionen')).toBeInTheDocument();
	});

	it('names an unordered period at the end date and clears it once the date changes', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);
		await screen.findByRole('heading', { name: 'Praxis Dr. Yilmaz (Beispiel)' });

		await userEvent.click(screen.getByRole('spinbutton', { name: /Jahr, Von/ }));
		await userEvent.keyboard(String(new Date().getFullYear() + 1));
		await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		expect(await screen.findByText('Das Ende liegt vor dem Anfang')).toBeInTheDocument();
		expect(screen.getByRole('group', { name: 'Bis' })).toHaveAccessibleDescription(
			/Das Ende liegt vor dem Anfang/
		);
		expect(screen.queryByText(/Die Angaben wurden nicht angenommen/)).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole('spinbutton', { name: /Jahr, Von/ }));
		await userEvent.keyboard(String(new Date().getFullYear()));
		expect(screen.queryByText('Das Ende liegt vor dem Anfang')).not.toBeInTheDocument();
	});

	it('blocks issuing while the billing profile is missing required data', async () => {
		signInForBilling();
		const raw = await fetch(`/api/invoices/${invoiceIds.yilmazDraft}`).then((res) => res.json());
		server.use(
			http.get(`/api/invoices/${invoiceIds.yilmazDraft}`, () =>
				HttpResponse.json({ ...raw, blockers: ['tax_number_missing'] })
			)
		);
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);

		expect(
			await screen.findByText(
				'In den Rechnungsangaben des Rechnungsstellers fehlt die Steuernummer.'
			)
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Ausstellen' })).toBeDisabled();
	});

	it('discards a draft and returns to the invoice list', async () => {
		signInForBilling();
		renderApp(`/billing/invoices/${invoiceIds.yilmazDraft}`);
		await screen.findByRole('heading', { name: 'Praxis Dr. Yilmaz (Beispiel)' });

		await userEvent.click(screen.getByRole('button', { name: 'Entwurf verwerfen' }));
		const dialog = await screen.findByRole('alertdialog');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Entwurf verwerfen' }));

		expect(await screen.findByRole('table', { name: 'Rechnungen' })).toBeInTheDocument();
	});
});
