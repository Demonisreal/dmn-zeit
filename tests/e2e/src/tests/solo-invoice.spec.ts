import { readFile } from 'node:fs/promises';
import { fillDate, fillTime } from '../support/date-segments';
import { STEP_MS, totpCode } from '../totp';
import { expect, seed, test } from '../fixtures';

// a booking has to end in the past, so the manual entry goes on last week's monday
function lastMonday() {
	const today = new Date(
		new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
	);
	today.setUTCDate(today.getUTCDate() - (((today.getUTCDay() + 6) % 7) + 7));
	return today.toISOString().slice(0, 10);
}

test('Solo: Zeit erfassen, Rechnung daraus ausstellen, PDF laden und stornieren', async ({
	page,
	signIn
}) => {
	const { owner, clientName, projectName } = seed.invoicing;
	await signIn(owner);
	await page.goto('/');

	const timer = page.getByRole('group', { name: 'Projekt-Timer' });
	await timer.getByRole('combobox', { name: 'Projekt' }).click();
	await page.getByRole('option', { name: projectName }).click();
	await timer.getByRole('button', { name: 'Start' }).click();
	await expect(timer.getByText(/^Läuft seit/)).toBeVisible();
	await timer.getByRole('button', { name: 'Stopp' }).click();
	await expect(timer.getByText('Kein Timer läuft')).toBeVisible();

	const monday = lastMonday();
	await page.goto(`/?week=${monday}`);
	await page.getByRole('button', { name: 'Projektzeit nachtragen' }).click();
	const entry = page.getByRole('form', { name: 'Projektzeit nachtragen' });
	await entry.getByRole('combobox', { name: 'Projekt' }).fill(projectName);
	await page.getByRole('option', { name: projectName }).click();
	await fillTime(entry.getByRole('group', { name: 'Beginn' }), '08:00');
	await fillTime(entry.getByRole('group', { name: 'Ende' }), '12:00');
	await entry.getByLabel('Notiz').fill('Datenmodell der Altsysteme abgeglichen.');
	await entry.getByRole('button', { name: 'Nachtragen' }).click();
	await expect(page.getByText('Projektzeit nachgetragen.')).toBeVisible();
	await expect(page.getByRole('row', { name: new RegExp(projectName) })).toContainText('4:00');

	await page.goto('/billing/invoices/new');
	await fillDate(page.getByRole('group', { name: 'Von' }), monday);
	await page.getByRole('button', { name: /Kunde/ }).click();
	await page.getByRole('option', { name: clientName }).click();
	await expect(page.getByText('380,00 €')).toBeVisible();
	await page.getByRole('button', { name: 'Entwurf erstellen' }).click();

	await expect(page.getByRole('heading', { name: clientName })).toBeVisible();
	await expect(page.getByText(projectName)).toBeVisible();
	await page.getByRole('button', { name: 'Ausstellen' }).click();

	const issueDialog = page.getByRole('alertdialog', { name: 'Rechnung ausstellen' });
	await issueDialog.getByRole('button', { name: 'Jetzt ausstellen' }).click();

	const stepUp = page.getByRole('dialog', { name: 'Erneut bestätigen' });
	await expect(stepUp).toBeVisible();
	await stepUp.getByLabel('Passwort').fill(owner.password);
	// the login behind the seeded session already used the current authenticator step
	await stepUp
		.getByLabel('Code aus der Authenticator-App')
		.fill(totpCode(owner.totpSecret, new Date(Date.now() + STEP_MS)));
	await stepUp.getByRole('button', { name: 'Bestätigen' }).click();

	await expect(page.getByText('ausgestellt', { exact: true })).toBeVisible();
	await expect(page.getByText('452,20 €')).toBeVisible();
	const number = (await page.getByRole('heading', { level: 1 }).textContent())!;
	expect(number).toMatch(/\d{4}-\d{4}$/);

	const download = page.waitForEvent('download');
	await page.getByRole('link', { name: 'PDF herunterladen', exact: true }).click();
	const pdf = await download;
	expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
	const bytes = await readFile((await pdf.path())!);
	expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

	await page.getByRole('button', { name: 'Stornieren' }).click();
	const cancelDialog = page.getByRole('alertdialog', { name: `Rechnung ${number} stornieren` });
	await cancelDialog.getByLabel('Grund').fill('Leistungszeitraum falsch angegeben.');
	await cancelDialog.getByRole('button', { name: 'Stornorechnung ausstellen' }).click();

	await expect(page.getByText('storniert', { exact: true })).toBeVisible();
	await expect(page.getByText('Stornogrund: Leistungszeitraum falsch angegeben.')).toBeVisible();

	await page.getByRole('link', { name: 'Alle Rechnungen' }).click();
	const rows = page.getByRole('table', { name: 'Rechnungen' }).getByRole('row');
	await expect(rows.filter({ hasText: number })).toContainText('storniert');
	await rows
		.filter({ hasText: clientName, hasNotText: number })
		.getByRole('link', { name: /^\d{4}-\d{4}$/ })
		.click();
	await expect(page.getByText('Stornorechnung', { exact: true })).toBeVisible();
	await expect(page.getByText(`Stornorechnung zu ${number}.`)).toBeVisible();
});
