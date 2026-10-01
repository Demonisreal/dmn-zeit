import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, seed, test } from '../fixtures';

async function scan(page: Page) {
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations, JSON.stringify(results.violations, null, '\t')).toEqual([]);
}

test('Login-Seite ohne axe-Befund', async ({ page }) => {
	await page.goto('/login');
	await scan(page);
});

test('Wochenbuch ohne axe-Befund', async ({ page, signIn }) => {
	await signIn(seed.company.employee);
	await page.goto('/');
	await scan(page);
});

test('Anträge ohne axe-Befund', async ({ page, signIn }) => {
	await signIn(seed.company.employee);
	await page.goto('/absences');
	await scan(page);
});

test('Urlaubskonto ohne axe-Befund', async ({ page, signIn }) => {
	await signIn(seed.company.employee);
	await page.goto('/vacation');
	await scan(page);
});

test('Posteingang ohne axe-Befund', async ({ page, signIn }) => {
	await signIn(seed.company.teamLead);
	await page.goto('/inbox');
	await scan(page);
});

test('Personal-Übersicht ohne axe-Befund', async ({ page, signIn }) => {
	await signIn(seed.company.hr);
	await page.goto('/hr');
	await scan(page);
});

test('Verwaltung ohne axe-Befund', async ({ page, signIn }) => {
	await signIn(seed.company.admin);
	await page.goto('/admin');
	await scan(page);
});
