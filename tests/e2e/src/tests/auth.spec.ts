import { PASSWORD } from '../seed/constants';
import { totpCode } from '../totp';
import { expect, seed, test } from '../fixtures';

test(
	'Einladung annehmen und Authenticator-App einrichten',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { invitee } = seed.company;
		await page.goto(`/invite#t=${invitee.inviteToken}`);

		await expect(page.getByRole('heading', { name: 'Passwort festlegen' })).toBeVisible();
		await page.getByLabel('Neues Passwort').fill(PASSWORD);
		await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
		await page.getByRole('button', { name: 'Passwort festlegen' }).click();

		await expect(page).toHaveURL(/\/security\/setup$/);
		await page.getByRole('button', { name: 'Authenticator-App einrichten' }).click();

		const secret = (await page.locator('code').first().textContent())!.replace(/\s/g, '');
		await page.getByLabel('Code aus der App').fill(totpCode(secret));
		await page.getByRole('button', { name: 'Bestätigen' }).click();

		await expect(page.getByRole('heading', { name: 'Wiederherstellungscodes' })).toBeVisible();
		await page.getByRole('checkbox', { name: /sicheren Ort gespeichert/ }).check();
		await page.getByRole('button', { name: 'Weiter' }).click();

		// the invitee has no personnel record yet, the week page says so instead of showing a clock
		await expect(page).toHaveURL(seed.baseURL + '/');
		await expect(
			page.getByRole('heading', { name: 'Zu diesem Konto gibt es keinen Personalstamm' })
		).toBeVisible();
	}
);

test('Anmeldung mit Passwort und Authenticator-Code', { tag: '@mobile' }, async ({ page }) => {
	const { employee } = seed.company;
	await page.goto('/login');
	await page.getByLabel('E-Mail').fill(employee.email);
	await page.getByLabel('Passwort').fill(employee.password);
	await page.getByRole('button', { name: 'Anmelden' }).click();

	await expect(page).toHaveURL(/\/login\/verify$/);
	await expect(page.getByRole('heading', { name: 'Anmeldung bestätigen' })).toBeVisible();
	await page.getByLabel('Code aus der App').fill(totpCode(employee.totpSecret));
	await page.getByRole('button', { name: 'Bestätigen' }).click();

	await expect(page).toHaveURL(seed.baseURL + '/');
	await expect(page.getByRole('group', { name: 'Stempeln' })).toBeVisible();
});
