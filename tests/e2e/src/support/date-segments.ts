import type { Locator, Page } from '@playwright/test';

// react-aria fields take digits per segment and jump on by themselves, same helper shape as
// apps/web/src/features/week/correction-form.spec.tsx and absences-page.spec.tsx use in vitest

// a labelled time field renders as a group, "Kommen"/"Gehen" in correction-form.tsx
export async function fillTime(scope: Locator, hhmm: string) {
	const hour = scope.getByRole('spinbutton').first();
	await hour.click();
	await hour.pressSequentially(hhmm.replace(':', ''));
}

// the range picker names its own segments "Tag, Startdatum" / "Tag, Enddatum", ddmmyyyy in one go
export async function fillDateRange(page: Page, startIso: string, endIso: string) {
	await typeDate(page, 'Startdatum', startIso);
	await typeDate(page, 'Enddatum', endIso);
}

async function typeDate(page: Page, which: 'Startdatum' | 'Enddatum', iso: string) {
	const [year, month, day] = iso.split('-');
	const first = page.getByRole('spinbutton', { name: new RegExp(`Tag, ${which}`) });
	await first.click();
	await first.pressSequentially(`${day}${month}${year}`);
}
