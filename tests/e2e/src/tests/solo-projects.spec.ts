import { expect, seed, test } from '../fixtures';

test('Solo-Bereich: Projekt-Timer starten, stoppen und die Wochenmatrix prüfen', async ({
	page,
	signIn
}) => {
	const { owner, projectName } = seed.solo;
	await signIn(owner);
	await page.goto('/');

	const timer = page.getByRole('group', { name: 'Projekt-Timer' });
	await expect(timer.getByText('Kein Timer läuft')).toBeVisible();

	await timer.getByRole('combobox', { name: 'Projekt' }).click();
	await page.getByRole('option', { name: projectName }).click();
	await timer.getByRole('button', { name: 'Start' }).click();
	await expect(timer.getByText(/^Läuft seit/)).toBeVisible();

	await timer.getByRole('button', { name: 'Stopp' }).click();
	await expect(timer.getByText('Kein Timer läuft')).toBeVisible();

	await page.reload();
	await expect(page.getByRole('row', { name: new RegExp(projectName) })).toBeVisible();
});
