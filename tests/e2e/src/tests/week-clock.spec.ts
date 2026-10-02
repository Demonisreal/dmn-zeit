import { expect, seed, test } from '../fixtures';

test.beforeEach(async ({ signIn, page }) => {
	const { teamLead, secondEmployee } = seed.company;
	await signIn(test.info().project.name === 'mobile' ? secondEmployee : teamLead);
	await page.goto('/');
});

test(
	'Kommen, Pause und Gehen im Wochenbuch mit aufgeklappter Herleitung',
	{ tag: '@mobile' },
	async ({ page }) => {
		const clock = page.getByRole('group', { name: 'Stempeln' });
		// the panel shows the new state at once but drops presses until the refetch behind it is done
		const settled = () => expect(clock).not.toHaveAttribute('aria-busy', 'true');
		await expect(clock.getByText('Nicht eingestempelt')).toBeVisible();

		await clock.getByRole('button', { name: 'Kommen' }).click();
		await expect(clock.getByText(/^Läuft seit/)).toBeVisible();
		await settled();

		await clock.getByRole('button', { name: 'Pause' }).click();
		await expect(clock.getByText(/^Pause seit/)).toBeVisible();
		await settled();

		await clock.getByRole('button', { name: 'Weiter' }).click();
		await expect(clock.getByText(/^Läuft seit/)).toBeVisible();
		await settled();

		await clock.getByRole('button', { name: 'Gehen' }).click();
		await settled();
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
