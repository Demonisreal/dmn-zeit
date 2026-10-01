import type { InvoiceFormat } from '@zeit/shared';
import { isLeitwegId } from './mapping';

export function defaultInvoiceFormat(input: {
	clientFormat: InvoiceFormat | null;
	isBusiness: boolean;
	buyerReference: string | null;
	profileFormat: InvoiceFormat;
}): InvoiceFormat {
	if (input.clientFormat !== null) {
		return input.clientFormat;
	}
	if (!input.isBusiness) {
		return 'pdf';
	}
	if (isLeitwegId(input)) {
		return 'xrechnung';
	}
	return input.profileFormat === 'pdf' ? 'zugferd' : input.profileFormat;
}
