import { expect, seed, test } from '../fixtures';

test.beforeEach(async ({ signIn, page }) => {
	await signIn(seed.company.teamLead);
	await page.goto('/');
});

test(
	'Kommen, Pause und Gehen im Wochenbuch mit aufgeklappter Herleitung',
	{ tag: '@mobile' },
	async ({ page }) => {
		const clock = page.getByRole('group', { name: 'Stempeln' });
		await expect(clock.getByText('Nicht eingestempelt')).toBeVisible();

		await clock.getByRole('button', { name: 'Kommen' }).click();
		await expect(clock.getByText(/^Läuft seit/)).toBeVisible();

		await clock.getByRole('button', { name: 'Pause' }).click();
		await expect(clock.getByText(/^Pause seit/)).toBeVisible();

		await clock.getByRole('button', { name: 'Gehen' }).click();
		await expect(clock.getByText('Nicht eingestempelt')).toBeVisible();

		await page
			.locator('tr[data-current]')
			.getByRole('button', { name: /Herleitung/ })
			.click();

		await expect(page.getByRole('heading', { name: 'Buchungen', level: 3 })).toBeVisible();
		const calc = page.getByRole('heading', { name: 'Rechnung', level: 3 }).locator('..');
		await expect(calc.getByText('Ist')).toBeVisible();
		await expect(calc.getByText('Soll')).toBeVisible();
	}
);
