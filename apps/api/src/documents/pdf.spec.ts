// pdf-parse's package root runs a debug demo when required without a module.parent (as vitest does)
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { describe, expect, it } from 'vitest';
import { legalNoteTexts } from '../invoices/texts';
import { invoiceFixture, invoiceLineFixture } from './invoice.fixture';
import { buildInvoicePdf } from './pdf';

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
				refersTo: { id: 'x', number: 'RE-2026-0007' }
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
});
