import { fillTime } from '../support/date-segments';
import { expect, seed, secondSession, test } from '../fixtures';

test('Korrekturantrag stellen und von der Teamleitung genehmigen lassen', async ({
	page,
	browser,
	signIn
}) => {
	const { employee, teamLead } = seed.company;

	await signIn(employee);
	await page.goto('/');
	await page
		.locator('tr[data-current]')
		.getByRole('button', { name: /Herleitung/ })
		.click();

	await page.getByRole('button', { name: 'Korrektur beantragen' }).click();
	const form = page.getByRole('form', { name: 'Korrekturantrag' });
	// no booking exists yet today, "Fehlende Buchung nachtragen" is already selected by default
	await fillTime(form.getByRole('group', { name: 'Kommen' }), '08:00');
	await fillTime(form.getByRole('group', { name: 'Gehen' }), '16:30');
	await form.getByLabel('Begründung').fill('Vergessen einzustempeln, hier per Nachtrag ergänzt.');
	await form.getByRole('button', { name: 'Antrag stellen' }).click();
	await expect(page.getByText(/ändert sich erst mit der Genehmigung/)).toBeVisible();

	const tlContext = await secondSession(browser, seed.baseURL, teamLead);
	const tlPage = await tlContext.newPage();
	await tlPage.goto('/inbox');
	const request = tlPage.getByRole('group', { name: /^Erik Beschäftigt, Nachtrag/ });
	await request.getByRole('button', { name: 'Genehmigen' }).click();
	await expect(tlPage.getByText(/Antrag von Erik Beschäftigt genehmigt/)).toBeVisible();
	await tlContext.close();
});
