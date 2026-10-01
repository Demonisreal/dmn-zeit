import type { Locale } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { TEXTS } from '../einvoice/texts';

const AMOUNT: Record<Locale, Intl.NumberFormat> = {
	de: new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
	en: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
};

// cents stay well inside Number's safe range for a single invoice, unlike totals across years
export function formatCents(cents: string, locale: Locale): string {
	return `${AMOUNT[locale].format(Number(BigInt(cents)) / 100)} €`;
}

export function formatDate(isoDate: string, locale: Locale): string {
	return TEXTS[locale].date(Temporal.PlainDate.from(isoDate));
}

export function formatTaxRate(basisPoints: number): string {
	return `${(basisPoints / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;
}

export function formatHours(minutes: number): string {
	const whole = Math.abs(minutes);
	const sign = minutes < 0 ? '-' : '';
	return `${sign}${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const COUNTRY: Record<Locale, Intl.DisplayNames> = {
	de: new Intl.DisplayNames('de', { type: 'region' }),
	en: new Intl.DisplayNames('en', { type: 'region' })
};

export function formatCountry(countryCode: string, locale: Locale): string {
	return (COUNTRY[locale].of(countryCode) ?? countryCode).toLocaleUpperCase(locale);
}
