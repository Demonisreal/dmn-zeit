import type { InvoiceKind, Locale } from '@zeit/shared';
import { TEXTS } from '../einvoice/texts';

export const defaultIntroText: Record<Locale, string> = {
	de: 'vielen Dank für die gute Zusammenarbeit. Anbei die Rechnung für die erbrachten Leistungen.',
	en: 'thank you for the good cooperation. Please find attached the invoice for the services rendered.'
};

export const defaultClosingText: Record<Locale, string> = {
	de: 'Bitte überweisen Sie den Rechnungsbetrag bis zum genannten Zahlungsziel auf das unten stehende Konto.',
	en: 'Please transfer the invoice amount to the account below by the payment due date stated above.'
};

export const documentNames: Record<Locale, Record<InvoiceKind, string>> = {
	de: { invoice: 'Rechnung', cancellation: 'Stornorechnung' },
	en: { invoice: 'Invoice', cancellation: 'Cancellation' }
};

const notesIn = (locale: Locale): Record<string, string> => {
	const texts = TEXTS[locale];
	return {
		small_business_19: texts.smallBusiness,
		reverse_charge_13b: texts.reverseCharge,
		outside_scope_3a: texts.outsideScope,
		late_payment_286_consumer: texts.latePayment,
		exempt_reason: texts.exempt
	};
};

export const legalNoteTexts: Record<Locale, Record<string, string>> = {
	de: notesIn('de'),
	en: notesIn('en')
};
