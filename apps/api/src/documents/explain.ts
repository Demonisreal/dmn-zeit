import type { Explanation, Locale } from '@zeit/shared';

// turns the two explanation keys that survive into invoiceLineSchema.derivation into
// a printable sentence; everything else (billing.totals, billing.totals.group) is
// already visible as numbers in the tax summary table and needs no prose
const ROUNDING_WORD: Record<string, Record<Locale, string>> = {
	up: { de: 'aufgerundet', en: 'rounded up' },
	down: { de: 'abgerundet', en: 'rounded down' },
	nearest: { de: 'kaufmännisch gerundet', en: 'rounded to the nearest' }
};

const RATE_LEVEL_WORD: Record<string, Record<Locale, string>> = {
	task_employee: { de: 'Satz für Aufgabe und Person', en: 'rate for task and person' },
	task: { de: 'Aufgabensatz', en: 'task rate' },
	project_employee: { de: 'Satz für Projekt und Person', en: 'rate for project and person' },
	project: { de: 'Projektsatz', en: 'project rate' },
	client_employee: { de: 'Satz für Kunde und Person', en: 'rate for client and person' },
	client: { de: 'Kundensatz', en: 'client rate' },
	employee: { de: 'persönlicher Satz', en: 'personal rate' },
	default: { de: 'Standardsatz', en: 'default rate' }
};

export function roundingText(explanation: Explanation, locale: Locale): string | null {
	const mode = explanation.key.split('.').at(-1);
	const word = mode ? ROUNDING_WORD[mode]?.[locale] : undefined;
	if (!word) return null;
	const { raw, increment, rounded } = explanation.params;
	return locale === 'de'
		? `${raw} Min. ${word} auf ${rounded} Min. (${increment}-Min.-Raster)`
		: `${raw} min ${word} to ${rounded} min (${increment}-min. steps)`;
}

export function rateText(explanation: Explanation, locale: Locale): string | null {
	const level = explanation.key.split('.').at(-1);
	const word = level ? RATE_LEVEL_WORD[level]?.[locale] : undefined;
	return word ?? null;
}
