import { describe, expect, it } from 'vitest';
import {
	einvoiceBlockers,
	renderXRechnung,
	renderZugferd,
	type EInvoice
} from '../../src/einvoice/einvoice';
import { isLeitwegId } from '../../src/einvoice/mapping';
import { buyer, embeddedInvoice, FIXTURES, minimalPdf, seller } from './fixtures';

const standard = FIXTURES['standard-19']!;
const cancellation = FIXTURES['cancellation'] as Extract<EInvoice, { kind: 'cancellation' }>;

const withBuyerName = (name: string): EInvoice => ({ ...standard, buyer: { ...buyer, name } });

describe('einvoiceBlockers', () => {
	it.each(Object.entries(FIXTURES))('finds nothing on the fixture %s', (_name, invoice) => {
		expect(einvoiceBlockers(invoice, 'xrechnung')).toEqual([]);
		expect(einvoiceBlockers(invoice, 'zugferd')).toEqual([]);
	});

	it('wants reference, endpoint, contact and iban only for XRechnung', () => {
		const bare: EInvoice = {
			...standard,
			seller: { ...seller, iban: null, contactName: null, contactPhone: null },
			buyer: { ...buyer, email: null, buyerReference: null }
		};
		expect(einvoiceBlockers(bare, 'xrechnung')).toEqual([
			'seller_contact_missing',
			'iban_missing',
			'buyer_reference_missing',
			'buyer_endpoint_missing'
		]);
		expect(einvoiceBlockers(bare, 'zugferd')).toEqual([]);
	});

	it('lets a cancellation go without iban, nobody pays to it', () => {
		const noIban = { ...cancellation, seller: { ...seller, iban: null } };
		expect(einvoiceBlockers(noIban, 'xrechnung')).toEqual([]);
	});

	it('takes a Leitweg-ID as endpoint when the buyer has no mail', () => {
		expect(einvoiceBlockers(FIXTURES['public-leitweg']!, 'xrechnung')).toEqual([]);
		const orderNumber = { ...standard, buyer: { ...buyer, email: null, buyerReference: 'PO-1' } };
		expect(einvoiceBlockers(orderNumber, 'xrechnung')).toEqual(['buyer_endpoint_missing']);
	});

	it('takes no reference with a wrong check digit as Leitweg-ID endpoint', () => {
		const leitweg = FIXTURES['public-leitweg']!;
		const misspelt = {
			...leitweg,
			buyer: { ...leitweg.buyer, buyerReference: '14713000-DIGI01-45' }
		};
		expect(isLeitwegId(leitweg.buyer)).toBe(true);
		expect(isLeitwegId(misspelt.buyer)).toBe(false);
		expect(einvoiceBlockers(misspelt, 'xrechnung')).toEqual(['buyer_endpoint_missing']);
	});

	it('needs the tax number outside the scope of German VAT, the vat id must not be shown there', () => {
		const third = FIXTURES['third-country']!;
		expect(
			einvoiceBlockers({ ...third, seller: { ...seller, taxNumber: null } }, 'zugferd')
		).toEqual(['seller_tax_id_missing']);
		expect(
			einvoiceBlockers({ ...standard, seller: { ...seller, taxNumber: null } }, 'zugferd')
		).toEqual([]);
	});

	it('wants a reason for exempt lines', () => {
		const exempt: EInvoice = {
			...standard,
			treatment: 'exempt',
			lines: standard.lines.map((line) => ({ ...line, taxCategory: 'exempt', taxRateBp: 0 }))
		};
		expect(einvoiceBlockers(exempt, 'zugferd')).toEqual(['exemption_reason_missing']);
		expect(
			einvoiceBlockers({ ...exempt, exemptionReason: 'Steuerfrei nach § 4 Nr. 21 UStG' }, 'zugferd')
		).toEqual([]);
	});

	it('wants the vat id of the buyer on reverse charge, BR-AE-02', () => {
		const reverse = FIXTURES['reverse-charge-eu']!;
		const withoutVatId = { ...reverse, buyer: { ...reverse.buyer, vatId: null } };
		expect(einvoiceBlockers(withoutVatId, 'zugferd')).toEqual(['buyer_vat_id_missing']);
		expect(einvoiceBlockers(withoutVatId, 'xrechnung')).toEqual(['buyer_vat_id_missing']);
	});

	it.each([
		['backspace', 'Firma\u0008'],
		['U+FFFE', 'Firma￾'],
		['U+FFFF', 'Firma￿'],
		['a lone high surrogate', 'Firma\uD800'],
		['a lone low surrogate', 'Firma\uDC00'],
		['a swapped pair', 'Firma\uDC00\uD800']
	])('refuses %s', (_name, name) => {
		expect(einvoiceBlockers(withBuyerName(name), 'zugferd')).toEqual(['text_not_xml']);
	});

	it('keeps tabs, line breaks, umlauts and emoji', () => {
		expect(einvoiceBlockers(withBuyerName('Müller\t& Söhne\r\nKG \u{1F69A}'), 'zugferd')).toEqual(
			[]
		);
	});

	it('checks line texts and the cancelled number as well', () => {
		const line = { ...standard, lines: [{ ...standard.lines[0]!, description: 'Test￾' }] };
		expect(einvoiceBlockers(line, 'zugferd')).toEqual(['text_not_xml']);
		const cancels = { ...cancellation, cancels: { ...cancellation.cancels, number: 'RE\uD800' } };
		expect(einvoiceBlockers(cancels, 'zugferd')).toEqual(['text_not_xml']);
	});
});

describe('renderXRechnung', () => {
	it('refuses to render a blocked invoice', async () => {
		await expect(renderXRechnung(withBuyerName('Firma￿'))).rejects.toThrow(
			'xrechnung for RE-2026-0012 is blocked: text_not_xml'
		);
	});

	it('writes markup in a name as text', async () => {
		const xml = await renderXRechnung(withBuyerName('A </ram:Name><ram:ID>X</ram:ID> ]]> & B'));
		expect(xml).toContain(
			'<ram:Name>A &lt;/ram:Name&gt;&lt;ram:ID&gt;X&lt;/ram:ID&gt; ]]&gt; &amp; B</ram:Name>'
		);
		expect(xml).not.toContain('<ram:ID>X</ram:ID>');
	});

	it('bills minutes against the hourly rate per 60 minutes', async () => {
		const xml = await renderXRechnung(standard);
		expect(xml).toContain('<ram:BasisQuantity unitCode="MIN">60</ram:BasisQuantity>');
		expect(xml).toContain('<ram:BilledQuantity unitCode="MIN">50.000</ram:BilledQuantity>');
		expect(xml).toContain('<ram:LineTotalAmount>79.17</ram:LineTotalAmount>');
	});

	it('turns a cancellation into a credit note with positive amounts and the original number', async () => {
		const xml = await renderXRechnung(cancellation);
		expect(xml).toContain('<ram:TypeCode>381</ram:TypeCode>');
		expect(xml).toContain('<ram:IssuerAssignedID>RE-2026-0012</ram:IssuerAssignedID>');
		// the mirror image of RE-2026-0012, cent for cent
		expect(xml).toContain('<ram:DuePayableAmount>4333.59</ram:DuePayableAmount>');
		expect(await renderXRechnung(standard)).toContain(
			'<ram:DuePayableAmount>4333.59</ram:DuePayableAmount>'
		);
		expect(xml).toContain('<ram:BilledQuantity unitCode="MIN">2250.000</ram:BilledQuantity>');
		expect(xml).not.toMatch(/>-\d/);
	});

	it('puts a discount sign into the quantity, the price stays positive', async () => {
		const xml = await renderXRechnung(FIXTURES['mixed']!);
		expect(xml).toContain('<ram:BilledQuantity unitCode="LS">-1.000</ram:BilledQuantity>');
		expect(xml).toContain('<ram:ChargeAmount>150.00</ram:ChargeAmount>');
		expect(xml).not.toContain('<ram:ChargeAmount>-');
	});

	it('keeps the German reverse charge wording on English invoices', async () => {
		const xml = await renderXRechnung(FIXTURES['reverse-charge-eu']!);
		expect(xml).toContain('Steuerschuldnerschaft des Leistungsempfängers / Reverse charge');
		expect(xml).toContain('<ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>');
	});

	it('leaves both vat ids out when the supply is not subject to German VAT', async () => {
		const xml = await renderXRechnung(FIXTURES['third-country']!);
		expect(xml).not.toContain('schemeID="VA"');
		expect(xml).toContain('<ram:ID schemeID="FC">231/5123/4567</ram:ID>');
	});

	it('marks a sandbox invoice as specimen in a note, in the language of the invoice (X-01)', async () => {
		expect(await renderXRechnung({ ...standard, specimen: true })).toContain(
			'<ram:Content>Musterrechnung – keine Rechnung im Sinne des § 14 UStG</ram:Content>'
		);
		const english = { ...FIXTURES['reverse-charge-eu']!, specimen: true };
		expect(await renderXRechnung(english)).toContain(
			'<ram:Content>Specimen invoice – not an invoice within the meaning of § 14 UStG\nSteuerschuldnerschaft'
		);
		expect(await renderXRechnung(standard)).not.toContain('Musterrechnung');
	});

	it('writes the specimen and the cancellation reference into one note, CII-SR-030 allows one content', async () => {
		const xml = await renderXRechnung({ ...cancellation, specimen: true });
		expect(xml.match(/<ram:Content>/g)).toHaveLength(1);
		expect(xml).toContain(
			'<ram:Content>Musterrechnung – keine Rechnung im Sinne des § 14 UStG\nstorniert Rechnung RE-2026-0012 vom 04.05.2026</ram:Content>'
		);
	});
});

describe('renderZugferd', () => {
	it('returns the given pdf as PDF/A-3 with factur-x.xml in the EN 16931 profile', async () => {
		const document = await renderZugferd(standard, await minimalPdf());
		const raw = Buffer.from(document).toString('latin1');
		expect(raw.startsWith('%PDF-')).toBe(true);
		expect(raw).toContain('factur-x.xml');
		expect(raw).toContain('<pdfaid:part>3</pdfaid:part>');
		expect(raw).toContain('<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>');
		expect(embeddedInvoice(document)).toContain('<ram:ID>urn:cen.eu:en16931:2017</ram:ID>');
	});

	it('embeds the specimen note as well', async () => {
		const document = await renderZugferd({ ...standard, specimen: true }, await minimalPdf());
		expect(embeddedInvoice(document)).toContain(
			'<ram:Content>Musterrechnung – keine Rechnung im Sinne des § 14 UStG</ram:Content>'
		);
	});
});
