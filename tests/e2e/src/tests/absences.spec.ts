import type { Page } from '@playwright/test';
import { fillDateRange } from '../support/date-segments';
import { expect, seed, secondSession, test } from '../fixtures';

// a monday always carries a target, weekends in the seeded work model do not
function nextMonday(): string {
	const date = new Date();
	date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7));
	return date.toISOString().slice(0, 10);
}

async function available(page: Page) {
	const cell = page.getByRole('row', { name: /Verfügbar/ }).locator('td[data-numeric]');
	return Number((await cell.innerText()).replace(',', '.'));
}

test('Urlaubsantrag stellen, von der Teamleitung genehmigen, Abbuchung im Urlaubskonto', async ({
	page,
	browser,
	signIn
}) => {
	const { employee, teamLead } = seed.company;
	const day = nextMonday();

	await signIn(employee);
	await page.goto('/vacation');
	const before = await available(page);

	await page.goto('/absences');
	await page.getByRole('button', { name: 'Neuer Antrag' }).click();
	await page.getByRole('region', { name: 'Abwesenheit eintragen' }).waitFor();
	await fillDateRange(page, day, day);
	await page.getByRole('button', { name: 'Antrag stellen', exact: true }).click();
	await expect(page.getByText(/Die Teamleitung entscheidet darüber/)).toBeVisible();

	const tlContext = await secondSession(browser, seed.baseURL, teamLead);
	const tlPage = await tlContext.newPage();
	await tlPage.goto('/inbox');
	const request = tlPage.getByRole('group', { name: /^Erik Beschäftigt, Urlaub/ });
	await request.getByRole('button', { name: 'Genehmigen' }).click();
	await expect(tlPage.getByText(/Antrag von Erik Beschäftigt genehmigt/)).toBeVisible();
	await tlContext.close();

	await page.goto('/vacation');
	expect(await available(page)).toBeLessThan(before);
});
