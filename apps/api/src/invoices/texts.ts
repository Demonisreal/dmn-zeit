import type { Locale } from '@zeit/shared';

// pure data, no rendering here; the documents worker (10d/10e) picks the entry for its own locale
export const defaultIntroText: Record<Locale, string> = {
	de: 'vielen Dank für die gute Zusammenarbeit. Anbei die Rechnung für die erbrachten Leistungen.',
	en: 'thank you for the good cooperation. Please find attached the invoice for the services rendered.'
};

export const defaultClosingText: Record<Locale, string> = {
	de: 'Bitte überweisen Sie den Rechnungsbetrag bis zum genannten Zahlungsziel auf das unten stehende Konto.',
	en: 'Please transfer the invoice amount to the account below by the payment due date stated above.'
};

// rechnungen-recht.md §§ 3, 4, 9; exact wording of small_business_19 follows the recommended phrasing there
export const legalNoteTexts: Record<Locale, Record<string, string>> = {
	de: {
		small_business_19: 'Steuerbefreite Kleinunternehmerrechnung, kein Steuerausweis gemäß § 19 UStG.',
		reverse_charge_13b: 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).',
		late_payment_286_consumer:
			'Bei Zahlungsverzug fallen ab 30 Tagen nach Fälligkeit und Zugang dieser Rechnung Verzugszinsen an (§ 286 Abs. 3 BGB).',
		exempt_reason: 'Diese Position ist von der Umsatzsteuer befreit (§ 4 UStG).'
	},
	en: {
		small_business_19: 'Small business invoice exempt from VAT under § 19 UStG (German VAT act).',
		// planung-projekte.md Risiko 16: deutscher Rechtsbegriff bleibt auch auf der englischen Rechnung stehen
		reverse_charge_13b:
			'Steuerschuldnerschaft des Leistungsempfängers / Reverse charge: the recipient of the service is liable for VAT (§ 13b UStG).',
		late_payment_286_consumer:
			'Late payment interest applies 30 days after this invoice is due and received (§ 286 (3) BGB).',
		exempt_reason: 'This position is exempt from VAT (§ 4 UStG).'
	}
};
