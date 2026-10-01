import type { Locale } from '@zeit/shared';

const AMOUNT: Record<Locale, Intl.NumberFormat> = {
	de: new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
	en: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
};

// cents stay well inside Number's safe range for a single invoice, unlike totals across years
export function formatCents(cents: string, locale: Locale): string {
	return `${AMOUNT[locale].format(Number(BigInt(cents)) / 100)} €`;
}

// DIN 5008 numeric dates stay TT.MM.JJJJ in german correspondence, english partners get ISO
export function formatDate(isoDate: string, locale: Locale): string {
	if (locale === 'en') return isoDate;
	const [year, month, day] = isoDate.split('-');
	return `${day}.${month}.${year}`;
}

export function formatTaxRate(basisPoints: number): string {
	return `${(basisPoints / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;
}
