import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { invoiceTotals, roundDiv, type TaxCategory } from '@zeit/rules';
import { Temporal } from 'temporal-polyfill';
import type {
	EInvoice,
	EInvoiceBuyer,
	EInvoiceLine,
	EInvoiceSeller,
	ItemUnit
} from '../../src/einvoice/einvoice';

const day = (iso: string) => Temporal.PlainDate.from(iso);

const hours = (
	description: string,
	minutes: number,
	rateCents: bigint,
	[taxCategory, taxRateBp]: [TaxCategory, number],
	from = '2026-04-01',
	to = '2026-04-30'
): EInvoiceLine => ({
	description,
	quantity: { minutes },
	unitPriceCents: rateCents,
	netCents: roundDiv(BigInt(minutes) * rateCents, 60n),
	taxCategory,
	taxRateBp,
	serviceFrom: day(from),
	serviceTo: day(to)
});

const item = (
	description: string,
	milli: bigint,
	unit: ItemUnit,
	priceCents: bigint,
	[taxCategory, taxRateBp]: [TaxCategory, number]
): EInvoiceLine => ({
	description,
	quantity: { milli, unit },
	unitPriceCents: priceCents,
	netCents: roundDiv(milli * priceCents, 1000n),
	taxCategory,
	taxRateBp,
	serviceFrom: null,
	serviceTo: null
});

const priced = (lines: EInvoiceLine[]) => ({ lines, totals: invoiceTotals(lines) });

const STANDARD: [TaxCategory, number] = ['standard', 1900];
const REDUCED: [TaxCategory, number] = ['reduced', 700];

export const seller: EInvoiceSeller = {
	legalName: 'Mira Beispiel Softwareentwicklung',
	street: 'Lindenweg 4',
	postalCode: '04109',
	city: 'Leipzig',
	countryCode: 'DE',
	vatId: 'DE123456789',
	taxNumber: '231/5123/4567',
	iban: 'DE75512108001245126199',
	bic: 'SOGEDEFFXXX',
	contactName: 'Mira Beispiel',
	contactEmail: 'rechnung@mira-beispiel.example',
	contactPhone: '+49 341 2233445',
	registerCourt: null,
	registerNumber: null
};

export const buyer: EInvoiceBuyer = {
	name: 'Kranich Logistik GmbH',
	street: 'Hafenstraße 12',
	postalCode: '20457',
	city: 'Hamburg',
	countryCode: 'DE',
	vatId: 'DE987654321',
	email: 'buchhaltung@kranich-logistik.example',
	buyerReference: 'PO-2026-118'
};

const april = {
	issueDate: day('2026-05-04'),
	dueDate: day('2026-05-18'),
	serviceFrom: day('2026-04-01'),
	serviceTo: day('2026-04-30')
};

const standard: EInvoice = {
	kind: 'invoice',
	number: 'RE-2026-0012',
	...april,
	locale: 'de',
	specimen: false,
	treatment: 'regular',
	exemptionReason: null,
	seller,
	buyer,
	...priced([
		hours('Entwicklung Sendungsverfolgung', 2250, 9500n, STANDARD, '2026-04-01', '2026-04-24'),
		hours('Code-Review und Abstimmung', 50, 9500n, STANDARD, '2026-04-28', '2026-04-28')
	])
};

export const FIXTURES: Record<string, EInvoice> = {
	'standard-19': standard,
	'reduced-7': {
		kind: 'invoice',
		number: 'RE-2026-0013',
		...april,
		locale: 'de',
		specimen: false,
		treatment: 'regular',
		exemptionReason: null,
		seller,
		buyer,
		...priced([item('Schulungsunterlagen, gedruckt', 12_000n, 'C62', 2450n, REDUCED)])
	},
	mixed: {
		kind: 'invoice',
		number: 'RE-2026-0014',
		...april,
		locale: 'de',
		specimen: false,
		treatment: 'regular',
		exemptionReason: null,
		seller,
		buyer,
		...priced([
			hours(
				'Workshop Barrierefreiheit\nVorbereitung, Durchführung, Protokoll',
				405,
				11000n,
				STANDARD
			),
			item('Fachbuch "Barrierefreie Webanwendungen"', 2_000n, 'C62', 3990n, REDUCED),
			item('Rabatt Rahmenvertrag', 1_000n, 'LS', -15000n, STANDARD)
		])
	},
	'reverse-charge-eu': {
		kind: 'invoice',
		number: 'RE-2026-0015',
		...april,
		locale: 'en',
		specimen: false,
		treatment: 'reverse_charge',
		exemptionReason: null,
		seller,
		buyer: {
			name: 'Van Dijk Media B.V.',
			street: 'Keizersgracht 221',
			postalCode: '1016 DV',
			city: 'Amsterdam',
			countryCode: 'NL',
			vatId: 'NL853746291B01',
			email: 'invoices@vandijk-media.example',
			buyerReference: 'VDM-7731'
		},
		...priced([hours('Backend development, streaming API', 1920, 10500n, ['reverse_charge', 0])])
	},
	'third-country': {
		kind: 'invoice',
		number: 'RE-2026-0016',
		...april,
		locale: 'de',
		specimen: false,
		treatment: 'outside_scope',
		exemptionReason: null,
		seller,
		buyer: {
			name: 'Alpenblick Software AG',
			street: 'Bahnhofstrasse 21',
			postalCode: '8001',
			city: 'Zürich',
			countryCode: 'CH',
			vatId: 'CHE-123.456.789 MWST',
			email: 'kreditoren@alpenblick.example',
			buyerReference: 'AB-2026-044'
		},
		...priced([hours('Beratung Datenmigration', 960, 12000n, ['outside_scope', 0])])
	},
	'small-business': {
		kind: 'invoice',
		number: '2026-0003',
		...april,
		locale: 'de',
		specimen: false,
		treatment: 'small_business',
		exemptionReason: null,
		seller: {
			...seller,
			legalName: 'Jonas Kerber Webdesign',
			street: 'Am Mühlgraben 9',
			postalCode: '99084',
			city: 'Erfurt',
			vatId: null,
			taxNumber: '151/234/56789',
			iban: 'DE79000000001234567890',
			bic: null,
			contactName: 'Jonas Kerber',
			contactEmail: 'post@kerber-webdesign.example',
			contactPhone: '0221 4710-412'
		},
		buyer: { ...buyer, vatId: null },
		...priced([hours('Relaunch Firmenwebsite', 720, 6500n, ['small_business', 0])])
	},
	cancellation: {
		kind: 'cancellation',
		number: 'RE-2026-0019',
		cancels: { number: standard.number, issueDate: standard.issueDate },
		issueDate: day('2026-05-11'),
		dueDate: day('2026-05-25'),
		serviceFrom: standard.serviceFrom,
		serviceTo: standard.serviceTo,
		locale: 'de',
		specimen: false,
		treatment: 'regular',
		exemptionReason: null,
		seller,
		buyer,
		...priced(
			standard.lines.map((line) => ({
				...line,
				quantity:
					'minutes' in line.quantity ? { minutes: 0 - line.quantity.minutes } : line.quantity,
				netCents: -line.netCents
			}))
		)
	},
	'public-leitweg': {
		kind: 'invoice',
		number: 'RE-2026-0017',
		...april,
		locale: 'de',
		specimen: false,
		treatment: 'regular',
		exemptionReason: null,
		seller,
		buyer: {
			name: 'Stadt Leipzig, Amt für Digitalisierung',
			street: 'Martin-Luther-Ring 4-6',
			postalCode: '04109',
			city: 'Leipzig',
			countryCode: 'DE',
			vatId: null,
			email: null,
			buyerReference: '14713000-DIGI01-62'
		},
		...priced([hours('Barrierefreiheitsprüfung Bürgerportal', 1440, 9800n, STANDARD)])
	}
};

// one empty A4 page, stands in for the pdfkit document until 10d renders the real one
export const minimalPdf = () => readFile(new URL('./minimal.pdf', import.meta.url));

// pdf-lib stores attachments as flate streams, the invoice is the one that inflates to CII
export function embeddedInvoice(document: Uint8Array): string {
	const raw = Buffer.from(document).toString('latin1');
	for (const [, body = ''] of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
		try {
			const xml = inflateSync(Buffer.from(body, 'latin1')).toString('utf8');
			if (xml.includes('rsm:CrossIndustryInvoice')) {
				return xml;
			}
		} catch {
			// not deflated, like the XMP packet
		}
	}
	throw new Error('no embedded invoice in the pdf');
}
