import { InvoiceService } from '@e-invoice-eu/core';
import type { TaxedAmount, TaxGroup } from '@zeit/rules';
import type { Temporal } from 'temporal-polyfill';
import { einvoiceBlockers } from './blockers';
import { toUbl } from './mapping';
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
	buyerReference: string | null;
};

export type EInvoiceLine = TaxedAmount & {
	description: string;
	serviceFrom: Temporal.PlainDate | null;
	serviceTo: Temporal.PlainDate | null;
	quantity: { minutes: number } | { milli: bigint; unit: ItemUnit };
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
	specimen: boolean;
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

export { einvoiceBlockers };

const service = new InvoiceService(console);

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
