import type { Temporal } from 'temporal-polyfill';

export type Locale = 'de' | 'en';

type Texts = {
	reverseCharge: string;
	smallBusiness: string;
	outsideScope: string;
	cancels: (number: string, issued: string) => string;
	payableBy: (due: string) => string;
	offsetAgainst: (number: string) => string;
	date: (day: Temporal.PlainDate) => string;
};

// the wording still has to pass the tax advisor, open point in rechnungen-recht.md
export const TEXTS: Record<Locale, Texts> = {
	de: {
		reverseCharge: 'Steuerschuldnerschaft des Leistungsempfängers',
		smallBusiness: 'Steuerbefreite Kleinunternehmerrechnung, kein Steuerausweis gemäß § 19 UStG.',
		outsideScope:
			'Nicht im Inland steuerbare Leistung, Leistungsort nach § 3a Abs. 2 UStG im Ausland.',
		cancels: (number, issued) => `Stornorechnung zur Rechnung ${number} vom ${issued}.`,
		payableBy: (due) => `Zahlbar ohne Abzug bis ${due}.`,
		offsetAgainst: (number) => `Wird mit der Rechnung ${number} verrechnet.`,
		date: (day) =>
			day.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
	},
	en: {
		// Risk 16: the German wording stays on English invoices, § 14a UStG asks for it
		reverseCharge: 'Steuerschuldnerschaft des Leistungsempfängers / Reverse charge',
		smallBusiness: 'VAT exempt small business under § 19 UStG, no VAT shown.',
		outsideScope: 'Not taxable in Germany, place of supply abroad under § 3a (2) UStG.',
		cancels: (number, issued) => `Cancellation of invoice ${number} dated ${issued}.`,
		payableBy: (due) => `Payable without deduction by ${due}.`,
		offsetAgainst: (number) => `Offset against invoice ${number}.`,
		date: (day) => day.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
	}
};
