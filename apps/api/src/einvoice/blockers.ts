import type { EInvoice, EInvoiceFormat } from './einvoice';
import { buyerEndpoint } from './mapping';

const NOT_XML = /(?![\t\n\r])\p{Cc}|[\uD800-\uDFFF￾￿]/u;

const texts = (invoice: EInvoice) => [
	invoice.number,
	invoice.exemptionReason,
	invoice.kind === 'cancellation' ? invoice.cancels.number : null,
	...Object.values(invoice.seller),
	...Object.values(invoice.buyer),
	...invoice.lines.map((line) => line.description)
];

export function einvoiceBlockers(invoice: EInvoice, format: EInvoiceFormat): string[] {
	const { seller, buyer } = invoice;
	const blockers: string[] = [];
	if (texts(invoice).some((text) => text !== null && NOT_XML.test(text))) {
		blockers.push('text_not_xml');
	}
	if (!seller.street || !seller.postalCode || !seller.city) {
		blockers.push('seller_address_incomplete');
	}
	if (
		invoice.treatment === 'outside_scope' ? !seller.taxNumber : !seller.vatId && !seller.taxNumber
	) {
		blockers.push('seller_tax_id_missing');
	}
	if (invoice.treatment === 'reverse_charge' && !buyer.vatId) {
		blockers.push('buyer_vat_id_missing');
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
		if (!buyer.street || !buyer.postalCode || !buyer.city) {
			blockers.push('buyer_address_incomplete');
		}
	}
	return blockers;
}
