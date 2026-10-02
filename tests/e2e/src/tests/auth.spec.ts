import { PASSWORD } from '../seed/constants';
import { STEP_MS, totpCode } from '../totp';
import { expect, seed, test } from '../fixtures';

test(
	'Einladung annehmen und Authenticator-App einrichten',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { invitee, mobileInvitee } = seed.company;
		const { inviteToken } = test.info().project.name === 'mobile' ? mobileInvitee : invitee;
		await page.goto(`/invite#t=${inviteToken}`);

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
		await page.getByText(/sicheren Ort gespeichert/).click();
		await page.getByRole('button', { name: 'Weiter' }).click();

		// the invitee has no personnel record yet, the week page says so instead of showing a clock
		await expect(page).toHaveURL(seed.baseURL + '/');
		await expect(page.getByText('Zu diesem Konto gibt es keinen Personalstamm')).toBeVisible();
	}
);

test('Anmeldung mit Passwort und Authenticator-Code', { tag: '@mobile' }, async ({ page }) => {
	// the seeded session already used this authenticator step, and desktop and mobile run side by side
	const { employee, teamLead } = seed.company;
	const persona = test.info().project.name === 'mobile' ? teamLead : employee;
	await page.goto('/login');
	await page.getByLabel('E-Mail').fill(persona.email);
	await page.getByLabel('Passwort').fill(persona.password);
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();

	await expect(page).toHaveURL(/\/login\/verify\?/);
	await expect(page.getByRole('heading', { name: 'Anmeldung bestätigen' })).toBeVisible();
	await page
		.getByLabel('Code aus der App')
		.fill(totpCode(persona.totpSecret, new Date(Date.now() + STEP_MS)));
	await page.getByRole('button', { name: 'Bestätigen' }).click();

	await expect(page).toHaveURL(seed.baseURL + '/');
	await expect(page.getByRole('group', { name: 'Stempeln' })).toBeVisible();
});
