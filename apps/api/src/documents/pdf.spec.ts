import { describe, expect, it } from 'vitest';
import { legalNoteTexts } from '../invoices/texts';
import { invoiceFixture, invoiceLineFixture, taxGroupFixture } from './invoice.fixture';
import { buildInvoicePdf } from './pdf';
import { pdfParse } from './pdf-parse.fixture';

// pdfkit wraps long cells onto several lines, pdf-parse then hands them back with real line
// breaks in between; tests compare against the wrapped-free reading of the page
const flat = (raw: string) => raw.replace(/\s+/g, ' ').trim();

describe('buildInvoicePdf', () => {
	it('produces a PDF/A-3b buffer with the matching XMP conformance markers', async () => {
		const buffer = await buildInvoicePdf(invoiceFixture());
		const raw = buffer.toString('latin1');
		expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
		expect(raw).toContain('<pdfaid:part>3</pdfaid:part>');
		expect(raw).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
	});

	it('prints the position text, the customer and the derivation', async () => {
		const buffer = await buildInvoicePdf(invoiceFixture());
		const { text } = await pdfParse(buffer);
		expect(flat(text)).toContain('Relaunch Website, Umsetzung Startseite');
		expect(flat(text)).toContain('Agentur Nordlicht GmbH');
		expect(flat(text)).toContain('aufgerundet');
		expect(flat(text)).toContain('904,40 €');
	});

	it('marks a draft with the draft watermark and no invoice number field', async () => {
		const buffer = await buildInvoicePdf(
			invoiceFixture({ status: 'draft', number: null, issueDate: null, dueDate: null })
		);
		const { text } = await pdfParse(buffer);
		expect(text).toContain('Entwurf – keine Rechnung');
		expect(text).not.toContain('Rechnungsnummer');
	});

	it('marks a sandbox invoice with the specimen watermark (X-01)', async () => {
		const buffer = await buildInvoicePdf(invoiceFixture({ specimen: true, number: 'MUSTER-2026-0001' }));
		const { text } = await pdfParse(buffer);
		expect(flat(text)).toContain('Musterrechnung – keine Rechnung im Sinne des § 14 UStG');
	});

	it('shows both watermarks for a sandbox draft', async () => {
		const buffer = await buildInvoicePdf(
			invoiceFixture({ status: 'draft', specimen: true, number: null, issueDate: null, dueDate: null })
		);
		const { text } = await pdfParse(buffer);
		expect(flat(text)).toContain('Entwurf – keine Rechnung');
		expect(flat(text)).toContain('Musterrechnung – keine Rechnung im Sinne des § 14 UStG');
	});

	it('labels a cancellation and names the original invoice number, never "Gutschrift"', async () => {
		const buffer = await buildInvoicePdf(
			invoiceFixture({
				kind: 'cancellation',
				number: 'RE-2026-0009',
				refersTo: { id: 'x', number: 'RE-2026-0007', issueDate: '2026-09-01' }
			})
		);
		const { text } = await pdfParse(buffer);
		expect(text).toContain('Stornorechnung');
		expect(flat(text)).toContain('storniert Rechnung RE-2026-0007');
		expect(flat(text).toLowerCase()).not.toContain('gutschrift');
	});

	it('renders the reverse charge legal note that the invoices module already resolved', async () => {
		const buffer = await buildInvoicePdf(
			invoiceFixture({
				treatment: 'reverse_charge',
				lines: [invoiceLineFixture({ taxCategory: 'reverse_charge', taxRateBp: 0, netCents: '76000' })],
				taxGroups: [
					{
						taxCategory: 'reverse_charge',
						taxRateBp: 0,
						netCents: '76000',
						taxCents: '0',
						explanation: { key: 'billing.totals.group', params: {} }
					}
				],
				totals: {
					netCents: '76000',
					taxCents: '0',
					grossCents: '76000',
					explanation: { key: 'billing.totals', params: {} }
				},
				legalNotes: ['Steuerschuldnerschaft des Leistungsempfängers / Reverse charge']
			})
		);
		const { text } = await pdfParse(buffer);
		expect(flat(text)).toContain('Steuerschuldnerschaft des Leistungsempfängers / Reverse charge');
	});

	it('shows both parties USt-IdNr. on a reverse charge invoice (§ 14a UStG)', async () => {
		const buffer = await buildInvoicePdf(
			invoiceFixture({
				treatment: 'reverse_charge',
				lines: [invoiceLineFixture({ taxCategory: 'reverse_charge', taxRateBp: 0, netCents: '76000' })],
				legalNotes: ['Steuerschuldnerschaft des Leistungsempfängers / Reverse charge']
			})
		);
		const { text } = await pdfParse(buffer);
		expect(flat(text)).toContain('USt-IdNr.: DE123456789');
		// buyer's id sits in the info block (label and value on separate lines), not the address window
		expect(flat(text)).toContain('USt-IdNr. Kunde DE987654321');
	});

	it('keeps the german legal term on an english reverse charge note (planung-projekte.md Risiko 16)', async () => {
		const buffer = await buildInvoicePdf(
			invoiceFixture({
				locale: 'en',
				treatment: 'reverse_charge',
				lines: [invoiceLineFixture({ taxCategory: 'reverse_charge', taxRateBp: 0, netCents: '76000' })],
				legalNotes: [legalNoteTexts.en.reverse_charge_13b!]
			})
		);
		const { text } = await pdfParse(buffer);
		expect(flat(text)).toContain('Steuerschuldnerschaft des Leistungsempfängers');
		expect(flat(text)).toContain('Reverse charge');
	});

	it('uses the reduced layout for a Kleinbetragsrechnung up to 250 €, but still prints tax rate and total', async () => {
		const buffer = await buildInvoicePdf(
			invoiceFixture({
				lines: [invoiceLineFixture({ netCents: '20000', taxRateBp: 1900 })],
				taxGroups: [
					{
						taxCategory: 'standard',
						taxRateBp: 1900,
						netCents: '20000',
						taxCents: '3800',
						explanation: { key: 'billing.totals.group', params: {} }
					}
				],
				totals: {
					netCents: '20000',
					taxCents: '3800',
					grossCents: '23800',
					explanation: { key: 'billing.totals', params: {} }
				}
			})
		);
		const { text } = await pdfParse(buffer);
		expect(text).toContain('Kleinbetragsrechnung');
		// § 33 UStDV: auch die Kleinbetragsrechnung braucht Steuersatz, Steuerbetrag und Gesamtsumme
		expect(flat(text)).toContain('19 %');
		expect(flat(text)).toContain('38,00 €');
		expect(flat(text)).toContain('238,00 €');
	});

	it('never opens a /URI action and prints a position text with a path literally (I-05)', async () => {
		const buffer = await buildInvoicePdf(
			invoiceFixture({ lines: [invoiceLineFixture({ description: '/etc/passwd' })] })
		);
		expect(buffer.toString('latin1')).not.toContain('/URI');
		const { text } = await pdfParse(buffer);
		expect(flat(text)).toContain('/etc/passwd');
	});

	it('carries only system-derived metadata, no email or uuid (I-07)', async () => {
		const buffer = await buildInvoicePdf(invoiceFixture());
		const { info } = await pdfParse(buffer);
		expect(info.Title).toBe('Rechnung RE-2026-0007');
		expect(info.Author).toBe('Lena Vogt – Softwareentwicklung');
		expect(info.Author).not.toContain('@');
		expect(JSON.stringify(info)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
	});

	it('sets a german title for a specimen invoice', async () => {
		const buffer = await buildInvoicePdf(invoiceFixture({ specimen: true, number: 'MUSTER-2026-0001' }));
		const { info } = await pdfParse(buffer);
		expect(info.Title).toBe('Musterrechnung MUSTER-2026-0001');
	});

	it('paginates and numbers pages when positions overflow one page', async () => {
		const many = Array.from({ length: 60 }, (_, index) =>
			invoiceLineFixture({ id: `line-${index}`, position: index + 1, description: `Position ${index + 1}` })
		);
		const buffer = await buildInvoicePdf(invoiceFixture({ lines: many }));
		const { text, numpages } = await pdfParse(buffer);
		expect(numpages).toBeGreaterThan(1);
		expect(text).toContain('Seite 1 von');
	});

	it('runs a draft over exactly as many pages as the invoice it becomes', async () => {
		for (let count = 1; count <= 90; count += 6) {
			const lines = Array.from({ length: count }, (_, index) =>
				invoiceLineFixture({
					id: `line-${index}`,
					position: index + 1,
					description: 'Umsetzung und Abstimmung mit dem Kunden '.repeat(1 + (index % 4))
				})
			);
			const issued = invoiceFixture({ lines, introText: 'Wie vereinbart berechnen wir:' });
			const draft = invoiceFixture({
				...issued,
				status: 'draft',
				number: null,
				numberYear: null,
				numberSeq: null,
				issueDate: null,
				dueDate: null,
				issuedAt: null,
				issuedBy: null
			});
			const [issuedPages, draftPages] = await Promise.all(
				[issued, draft].map(async (invoice) => (await pdfParse(await buildInvoicePdf(invoice))).numpages)
			);
			expect({ count, pages: draftPages }).toEqual({ count, pages: issuedPages });
		}
	}, 30_000);
});

describe('mandatory fields per case', () => {
	it('prints everything § 14 Abs. 4 UStG asks of a regularly taxed invoice', async () => {
		const { text } = await pdfParse(await buildInvoicePdf(invoiceFixture()));
		const page = flat(text);
		for (const field of [
			'Lena Vogt – Softwareentwicklung',
			'Musterweg 1',
			'40210 Düsseldorf',
			'Agentur Nordlicht GmbH',
			'Hafenstraße 12',
			'20359 Hamburg',
			'Steuernummer: 123/4567/8901',
			'Rechnungsnummer RE-2026-0007',
			'Rechnungsdatum 01.09.2026',
			'Leistungszeitraum 01.08.2026 – 31.08.2026',
			'Relaunch Website, Umsetzung Startseite',
			'760,00 €',
			'Umsatzsteuer 19 %',
			'144,40 €',
			'904,40 €',
			'Zahlbar innerhalb von 14 Tagen ohne Abzug.',
			'Fällig am 15.09.2026.',
			'IBAN DE79000000001234567890'
		]) {
			expect(page, field).toContain(field);
		}
		expect(page).toMatch(/Menge.*Startseite.*(\d+:\d{2} Std\.|\d+ Min\.)/);
	});

	it('shows no tax on a small-business invoice and prints the § 19 note instead', async () => {
		const exemptLine = { taxCategory: 'small_business' as const, taxRateBp: 0 };
		const { text } = await pdfParse(
			await buildInvoicePdf(
				invoiceFixture({
					taxProfile: 'small_business',
					treatment: 'small_business',
					lines: [invoiceLineFixture(exemptLine)],
					taxGroups: [taxGroupFixture({ ...exemptLine, taxCents: '0' })],
					totals: {
						netCents: '76000',
						taxCents: '0',
						grossCents: '76000',
						explanation: { key: 'billing.totals', params: {} }
					},
					legalNotes: [legalNoteTexts.de.small_business_19!]
				})
			)
		);
		const page = flat(text);
		expect(page).toContain('kein Steuerausweis gemäß § 19 UStG');
		expect(page).toContain('760,00 €');
		expect(page).not.toContain('Umsatzsteuer');
		expect(page).not.toContain('19 %');
	});

	it('warns a consumer about the 30-day default under § 286 BGB', async () => {
		const { text } = await pdfParse(
			await buildInvoicePdf(
				invoiceFixture({
					buyer: {
						...invoiceFixture().buyer,
						name: 'Jana Privat',
						isBusiness: false,
						vatId: null
					},
					legalNotes: [legalNoteTexts.de.late_payment_286_consumer!]
				})
			)
		);
		const page = flat(text);
		expect(page).toContain('Jana Privat');
		expect(page).toContain('§ 286 Abs. 3 BGB');
		expect(page).not.toContain('USt-IdNr. Kunde');
	});

	it('names the reason next to a tax-exempt position', async () => {
		const exempt = invoiceLineFixture({
			id: 'line-exempt',
			position: 2,
			kind: 'item',
			projectId: null,
			description: 'Prüfungsgebühr',
			minutes: null,
			quantityMilli: '1000',
			unit: 'C62',
			unitPriceCents: '5000',
			netCents: '5000',
			taxCategory: 'exempt',
			taxRateBp: 0,
			derivation: { entries: [], rounding: null, rate: null }
		});
		const { text } = await pdfParse(
			await buildInvoicePdf(
				invoiceFixture({
					lines: [invoiceLineFixture(), exempt],
					taxGroups: [
						taxGroupFixture(),
						taxGroupFixture({
							taxCategory: 'exempt',
							taxRateBp: 0,
							netCents: '5000',
							taxCents: '0'
						})
					],
					totals: {
						netCents: '81000',
						taxCents: '14440',
						grossCents: '95440',
						explanation: { key: 'billing.totals', params: {} }
					},
					legalNotes: [legalNoteTexts.de.exempt_reason!]
				})
			)
		);
		const page = flat(text);
		expect(page).toContain('Prüfungsgebühr');
		expect(page).toContain('0 %');
		expect(page).toContain('von der Umsatzsteuer befreit (§ 4 UStG)');
		expect(page).toContain('Umsatzsteuer 19 % 144,40 €');
		expect(page).toContain('954,40 €');
	});

	it('prints an english invoice with english labels and the same mandatory fields', async () => {
		const { text } = await pdfParse(
			await buildInvoicePdf(
				invoiceFixture({ locale: 'en', closingText: 'Thank you for working with us.' })
			)
		);
		const page = flat(text);
		for (const field of [
			'Invoice number RE-2026-0007',
			'Tax number: 123/4567/8901',
			'VAT 19 %',
			'904.40 €',
			'Payable within 14 days, no deductions.',
			'Bank details'
		]) {
			expect(page, field).toContain(field);
		}
		expect(page).toMatch(/Invoice date [^–]*2026/);
		expect(page).toMatch(/Service period [^–]*2026 – [^–]*2026/);
		expect(page).toMatch(/Due on [^–]*2026\./);
		expect(page).not.toContain('Rechnungsnummer');
		expect(page).not.toContain('Zahlbar');
	});
});
