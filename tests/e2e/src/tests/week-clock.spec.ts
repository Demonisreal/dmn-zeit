import { expect, seed, test } from '../fixtures';

test.beforeEach(async ({ signIn, page }) => {
	const { teamLead, secondEmployee } = seed.company;
	await signIn(test.info().project.name === 'mobile' ? secondEmployee : teamLead);
	await page.goto('/');
});

test(
	'Kommen, Pause, Weiter und Gehen, dann Gehen aus der Pause, mit aufgeklappter Herleitung',
	{ tag: '@mobile' },
	async ({ page }) => {
		const clock = page.getByRole('group', { name: 'Stempeln' });
		// the panel shows the new state at once but drops presses until the refetch behind it is done
		const press = async (name: string, state: string | RegExp) => {
			await clock.getByRole('button', { name }).click();
			await expect(clock.getByText(state)).toBeVisible();
			await expect(clock).not.toHaveAttribute('aria-busy', 'true');
			await expect(clock.getByText(state)).toBeVisible();
		};
		await expect(clock.getByText('Nicht eingestempelt')).toBeVisible();

		await press('Kommen', /^Läuft seit/);
		await press('Pause', /^Pause seit/);
		await press('Weiter', /^Läuft seit/);
		await press('Gehen', 'Nicht eingestempelt');

		await press('Kommen', /^Läuft seit/);
		await press('Pause', /^Pause seit/);
		await press('Gehen', 'Nicht eingestempelt');

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
