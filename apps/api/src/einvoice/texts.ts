import type { Temporal } from 'temporal-polyfill';

export type Locale = 'de' | 'en';

type Texts = {
	reverseCharge: string;
	smallBusiness: string;
	outsideScope: string;
	latePayment: string;
	exempt: string;
	exemption: (reason: string) => string;
	specimen: string;
	cancels: (number: string, issued: string) => string;
	payableBy: (due: string) => string;
	offsetAgainst: (number: string) => string;
	date: (day: Temporal.PlainDate) => string;
};

export const TEXTS: Record<Locale, Texts> = {
	de: {
		reverseCharge: 'Steuerschuldnerschaft des Leistungsempfängers',
		smallBusiness: 'Steuerbefreite Kleinunternehmerrechnung, kein Steuerausweis gemäß § 19 UStG.',
		outsideScope:
			'Nicht im Inland steuerbare Leistung, Leistungsort nach § 3a Abs. 2 UStG im Ausland.',
		latePayment:
			'Bei Zahlungsverzug fallen ab 30 Tagen nach Fälligkeit und Zugang dieser Rechnung Verzugszinsen an (§ 286 Abs. 3 BGB).',
		exempt: 'Diese Position ist von der Umsatzsteuer befreit (§ 4 UStG).',
		exemption: (reason) => `Umsatzsteuerbefreiung: ${reason}`,
		specimen: 'Musterrechnung – keine Rechnung im Sinne des § 14 UStG',
		cancels: (number, issued) => `storniert Rechnung ${number} vom ${issued}`,
		payableBy: (due) => `Zahlbar ohne Abzug bis ${due}.`,
		offsetAgainst: (number) => `Wird mit der Rechnung ${number} verrechnet.`,
		date: (day) =>
			day.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
	},
	en: {
		reverseCharge: 'Steuerschuldnerschaft des Leistungsempfängers / Reverse charge',
		smallBusiness: 'VAT exempt small business under § 19 UStG, no VAT shown.',
		outsideScope: 'Not taxable in Germany, place of supply abroad under § 3a (2) UStG.',
		latePayment:
			'Late payment interest applies 30 days after this invoice is due and received (§ 286 (3) BGB).',
		exempt: 'This position is exempt from VAT (§ 4 UStG).',
		exemption: (reason) => `VAT exemption: ${reason}`,
		specimen: 'Specimen invoice – not an invoice within the meaning of § 14 UStG',
		cancels: (number, issued) => `cancels invoice ${number} dated ${issued}`,
		payableBy: (due) => `Payable without deduction by ${due}.`,
		offsetAgainst: (number) => `Offset against invoice ${number}.`,
		date: (day) => day.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
	}
};
