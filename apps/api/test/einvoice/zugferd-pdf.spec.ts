import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Invoice } from '@zeit/shared';
import { describe, it } from 'vitest';
import {
	invoiceFixture,
	invoiceLineFixture,
	taxGroupFixture
} from '../../src/documents/invoice.fixture';
import { buildInvoicePdf } from '../../src/documents/pdf';
import { renderZugferd } from '../../src/einvoice/einvoice';
import { toEInvoice } from '../../src/einvoice/from-invoice';
import { legalNoteTexts } from '../../src/invoices/texts';

const outDir = process.env.VERAPDF_PDF_DIR;

const totals = (netCents: string, taxCents: string, grossCents: string) => ({
	netCents,
	taxCents,
	grossCents,
	explanation: { key: 'billing.totals', params: {} }
});

const regular = invoiceFixture();

const CASES: Record<string, Invoice> = {
	regular,
	'reverse-charge-en': invoiceFixture({
		locale: 'en',
		buyer: {
			...regular.buyer,
			name: 'Van Dijk Media B.V.',
			street: 'Keizersgracht 221',
			postalCode: '1016 DV',
			city: 'Amsterdam',
			countryCode: 'NL',
			vatId: 'NL853746291B01'
		},
		lines: [invoiceLineFixture({ taxCategory: 'reverse_charge', taxRateBp: 0 })],
		taxGroups: [taxGroupFixture({ taxCategory: 'reverse_charge', taxRateBp: 0, taxCents: '0' })],
		totals: totals('76000', '0', '76000'),
		legalNotes: [legalNoteTexts.en.reverse_charge_13b!]
	}),
	'small-business': invoiceFixture({
		taxProfile: 'small_business',
		seller: { ...regular.seller, vatId: null },
		buyer: { ...regular.buyer, vatId: null },
		lines: [invoiceLineFixture({ taxCategory: 'small_business', taxRateBp: 0 })],
		taxGroups: [taxGroupFixture({ taxCategory: 'small_business', taxRateBp: 0, taxCents: '0' })],
		totals: totals('76000', '0', '76000'),
		legalNotes: [legalNoteTexts.de.small_business_19!]
	}),
	cancellation: invoiceFixture({
		kind: 'cancellation',
		number: 'RE-2026-0009',
		refersTo: {
			id: '66666666-6666-6666-6666-666666666666',
			number: 'RE-2026-0007',
			issueDate: '2026-09-01'
		},
		lines: [invoiceLineFixture({ minutes: -480, netCents: '-76000' })],
		taxGroups: [taxGroupFixture({ netCents: '-76000', taxCents: '-14440' })],
		totals: totals('-76000', '-14440', '-90440')
	}),
	multipage: invoiceFixture({
		lines: Array.from({ length: 60 }, (_, i) =>
			invoiceLineFixture({ id: `line-${i}`, position: i + 1, description: `Position ${i + 1}` })
		),
		taxGroups: [taxGroupFixture({ netCents: '4560000', taxCents: '866400' })],
		totals: totals('4560000', '866400', '5426400')
	}),
	specimen: invoiceFixture({ specimen: true, number: 'MUSTER-2026-0001' })
};

describe.skipIf(!outDir)('ZUGFeRD PDFs for veraPDF', () => {
	it.each(Object.entries(CASES))('writes %s', async (name, invoice) => {
		const document = await renderZugferd(toEInvoice(invoice), await buildInvoicePdf(invoice));
		await writeFile(join(outDir!, `${name}.pdf`), document);
	});

	it('writes the plain pdf of a seller with markup characters in the name', async () => {
		const seller = { ...regular.seller, legalName: 'Müller & Co. <Kanzlei>' };
		await writeFile(
			join(outDir!, 'plain-markup.pdf'),
			await buildInvoicePdf(invoiceFixture({ seller }))
		);
	});
});
