import { InvoiceService } from '@e-invoice-eu/core';
import { Logger } from '@nestjs/common';
import type { TaxedAmount, TaxGroup } from '@zeit/rules';
import type { Temporal } from 'temporal-polyfill';
import { buyerEndpoint, toUbl } from './mapping';
import type { Locale } from './texts';

export type Treatment =
	'regular' | 'small_business' | 'reverse_charge' | 'outside_scope' | 'exempt';
export type EInvoiceFormat = 'xrechnung' | 'zugferd';
export type ItemUnit = 'HUR' | 'DAY' | 'C62' | 'LS';

export type EInvoiceSeller = {
	legalName: string;
	street: string | null;
	postalCode: string | null;
	city: string | null;
	countryCode: 'DE';
	vatId: string | null;
	taxNumber: string | null;
	iban: string | null;
	bic: string | null;
	contactName: string | null;
	contactEmail: string | null;
	contactPhone: string | null;
	registerCourt: string | null;
	registerNumber: string | null;
};

export type EInvoiceBuyer = {
	name: string;
	street: string | null;
	postalCode: string | null;
	city: string | null;
	countryCode: string;
	vatId: string | null;
	email: string | null;
	// BT-10, a Leitweg-ID for public buyers
	buyerReference: string | null;
};

// amounts as stored, a cancellation carries them negative
export type EInvoiceLine = TaxedAmount & {
	description: string;
	serviceFrom: Temporal.PlainDate | null;
	serviceTo: Temporal.PlainDate | null;
	quantity: { minutes: number } | { milli: bigint; unit: ItemUnit };
	// per hour on time lines
	unitPriceCents: bigint;
};

export type EInvoiceTotals = {
	groups: Pick<TaxGroup, 'taxCategory' | 'taxRateBp' | 'netCents' | 'taxCents'>[];
	netCents: bigint;
	taxCents: bigint;
	grossCents: bigint;
};

export type EInvoice = {
	number: string;
	issueDate: Temporal.PlainDate;
	dueDate: Temporal.PlainDate;
	serviceFrom: Temporal.PlainDate;
	serviceTo: Temporal.PlainDate;
	locale: Locale;
	treatment: Treatment;
	exemptionReason: string | null;
	seller: EInvoiceSeller;
	buyer: EInvoiceBuyer;
	lines: EInvoiceLine[];
	totals: EInvoiceTotals;
} & (
	| { kind: 'invoice' }
	| { kind: 'cancellation'; cancels: { number: string; issueDate: Temporal.PlainDate } }
);

// XML 1.0 has no place for these, the builder would write a broken document (B8)
const NOT_XML = /(?![\t\n\r])\p{Cc}|[\uD800-\uDFFF￾￿]/u;

const texts = (invoice: EInvoice) => [
	invoice.number,
	invoice.exemptionReason,
	invoice.kind === 'cancellation' ? invoice.cancels.number : null,
	...Object.values(invoice.seller),
	...Object.values(invoice.buyer),
	...invoice.lines.map((line) => line.description)
];

// checked before the number is taken, rendering happens later in the worker and must not fail there
export function einvoiceBlockers(invoice: EInvoice, format: EInvoiceFormat): string[] {
	const { seller, buyer } = invoice;
	const blockers: string[] = [];
	if (texts(invoice).some((text) => text !== null && NOT_XML.test(text))) {
		blockers.push('text_not_xml');
	}
	if (!seller.postalCode || !seller.city) {
		blockers.push('seller_address_incomplete');
	}
	// BR-O-2 bans the vat id next to "not subject to VAT", only the tax number is left
	if (
		invoice.treatment === 'outside_scope' ? !seller.taxNumber : !seller.vatId && !seller.taxNumber
	) {
		blockers.push('seller_tax_id_missing');
	}
	if (invoice.lines.some((line) => line.taxCategory === 'exempt') && !invoice.exemptionReason) {
		blockers.push('exemption_reason_missing');
	}
	if (format === 'xrechnung') {
		if (!seller.contactName || !seller.contactPhone || !seller.contactEmail) {
			blockers.push('seller_contact_missing');
		}
		if (invoice.kind === 'invoice' && !seller.iban) {
			blockers.push('iban_missing');
		}
		if (!buyer.buyerReference) {
			blockers.push('buyer_reference_missing');
		}
		if (!buyerEndpoint(buyer)) {
			blockers.push('buyer_endpoint_missing');
		}
		if (!buyer.postalCode || !buyer.city) {
			blockers.push('buyer_address_incomplete');
		}
	}
	return blockers;
}

const service = new InvoiceService(new Logger('EInvoice'));

function assertRenderable(invoice: EInvoice, format: EInvoiceFormat) {
	const blockers = einvoiceBlockers(invoice, format);
	if (blockers.length > 0) {
		throw new Error(`${format} for ${invoice.number} is blocked: ${blockers.join(', ')}`);
	}
}

export async function renderXRechnung(invoice: EInvoice): Promise<string> {
	assertRenderable(invoice, 'xrechnung');
	const xml = await service.generate(toUbl(invoice), {
		format: 'XRECHNUNG-CII',
		lang: invoice.locale,
		noWarnings: true
	});
	return xml as string;
}

// the pdf comes from the invoice renderer, the library embeds factur-x.xml and turns it into PDF/A-3
export async function renderZugferd(invoice: EInvoice, pdf: Uint8Array): Promise<Uint8Array> {
	assertRenderable(invoice, 'zugferd');
	const document = await service.generate(toUbl(invoice), {
		format: 'Factur-X-EN16931',
		lang: invoice.locale,
		pdf: { buffer: pdf, filename: `${invoice.number}.pdf`, mimetype: 'application/pdf' },
		noWarnings: true
	});
	return document as Uint8Array;
}
