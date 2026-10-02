import type { Invoice, InvoiceLine } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import type { EInvoice, EInvoiceLine, Treatment } from './einvoice';

const day = (iso: string) => Temporal.PlainDate.from(iso);

function issuance(invoice: Invoice) {
	if (invoice.status === 'draft') {
		const issueDate = day(invoice.serviceTo);
		return {
			number: 'ENTWURF',
			issueDate,
			dueDate: issueDate.add({ days: invoice.paymentTermsDays })
		};
	}
	if (invoice.number === null || invoice.issueDate === null || invoice.dueDate === null) {
		throw new Error(`invoice ${invoice.id} is ${invoice.status} without number or dates`);
	}
	return {
		number: invoice.number,
		issueDate: day(invoice.issueDate),
		dueDate: day(invoice.dueDate)
	};
}

function cancelled(invoice: Invoice) {
	const { refersTo } = invoice;
	if (refersTo === null || refersTo.number === null || refersTo.issueDate === null) {
		throw new Error(`cancellation ${invoice.id} does not point to an issued invoice`);
	}
	return { number: refersTo.number, issueDate: day(refersTo.issueDate) };
}

function treatmentOf({ treatment }: Invoice): Treatment {
	if (
		treatment === 'reverse_charge' ||
		treatment === 'outside_scope' ||
		treatment === 'small_business'
	) {
		return treatment;
	}
	return 'regular';
}

function exemptionReason(lines: readonly InvoiceLine[]): string | null {
	const reasons = lines
		.filter((line) => line.taxCategory === 'exempt')
		.map((line) => line.exemptionReason);
	return reasons.length === 0 || reasons.includes(null) ? null : [...new Set(reasons)].join('; ');
}

const toLine = (line: InvoiceLine): EInvoiceLine => ({
	description: line.description,
	serviceFrom: line.serviceFrom === null ? null : day(line.serviceFrom),
	serviceTo: line.serviceTo === null ? null : day(line.serviceTo),
	quantity:
		line.kind === 'time'
			? { minutes: line.minutes! }
			: { milli: BigInt(line.quantityMilli!), unit: line.unit! },
	unitPriceCents: BigInt(line.unitPriceCents!),
	netCents: BigInt(line.netCents),
	taxCategory: line.taxCategory,
	taxRateBp: line.taxRateBp
});

export function toEInvoice(invoice: Invoice): EInvoice {
	const { seller, buyer, totals } = invoice;
	const kind =
		invoice.kind === 'cancellation'
			? { kind: 'cancellation' as const, cancels: cancelled(invoice) }
			: { kind: 'invoice' as const };
	return {
		...kind,
		...issuance(invoice),
		serviceFrom: day(invoice.serviceFrom),
		serviceTo: day(invoice.serviceTo),
		locale: invoice.locale,
		specimen: invoice.specimen,
		treatment: treatmentOf(invoice),
		exemptionReason: exemptionReason(invoice.lines),
		seller: {
			legalName: seller.legalName,
			street: seller.street,
			postalCode: seller.postalCode,
			city: seller.city,
			countryCode: 'DE',
			vatId: seller.vatId,
			taxNumber: seller.taxNumber,
			iban: seller.iban,
			bic: seller.bic,
			contactName: seller.contactName,
			contactEmail: seller.contactEmail,
			contactPhone: seller.contactPhone,
			registerCourt: seller.registerCourt,
			registerNumber: seller.registerNumber
		},
		buyer: {
			name: buyer.name,
			street: buyer.street,
			postalCode: buyer.postalCode,
			city: buyer.city,
			countryCode: buyer.countryCode,
			vatId: buyer.vatId,
			email: buyer.email,
			buyerReference: buyer.buyerReference
		},
		lines: invoice.lines.map(toLine),
		totals: {
			groups: invoice.taxGroups.map((group) => ({
				taxCategory: group.taxCategory,
				taxRateBp: group.taxRateBp,
				netCents: BigInt(group.netCents),
				taxCents: BigInt(group.taxCents)
			})),
			netCents: BigInt(totals.netCents),
			taxCents: BigInt(totals.taxCents),
			grossCents: BigInt(totals.grossCents)
		}
	};
}
