import { expect, seed, test } from '../fixtures';

test.beforeEach(async ({ signIn }) => {
	await signIn(seed.company.employee);
});

for (const path of ['/hr', '/admin']) {
	test(`Beschäftigte werden von ${path} weg auf die Startseite geleitet`, async ({ page }) => {
		await page.goto(path);
		await expect(page).toHaveURL(seed.baseURL + '/');
	});
}
