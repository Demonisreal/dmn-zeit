import { ApiClient, ApiRequestError } from '../api-client';
import { expect, seed, test } from '../fixtures';

const month = '2026-08';
// cest in august is utc+2
const blockerSpan = { startedAt: '2026-08-10T06:00:00.000Z', endedAt: '2026-08-10T14:30:00.000Z' };

async function submitCorrection(employeeId: string) {
	const { employee } = seed.company;
	const api = new ApiClient(seed.baseURL);
	await api.login(employee.email, employee.password, employee.totpSecret);
	await api.post('/corrections', {
		action: 'add',
		employeeId,
		...blockerSpan,
		reason: 'Für den Monatsabschluss-Test absichtlich offen gelassen.'
	});
	return api;
}

test('Monatsabschluss meldet einen Blocker, sperrt Buchungen erst danach', async ({
	page,
	signIn
}) => {
	const { hr, employee } = seed.company;
	await submitCorrection(employee.employeeId!);

	await signIn(hr);
	await page.goto(`/hr/months/${month}`);
	await expect(page.getByText('Offene Korrekturanträge')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Monat abschließen' })).toBeDisabled();
	await expect(page.getByText(/Erst abschließbar/)).toBeVisible();

	await page.goto('/inbox');
	await page
		.getByRole('group', { name: /^Erik Beschäftigt, Nachtrag/ })
		.getByRole('button', { name: 'Genehmigen' })
		.click();
	await expect(page.getByText(/Antrag von Erik Beschäftigt genehmigt/)).toBeVisible();

	await page.goto(`/hr/months/${month}`);
	await expect(page.getByRole('button', { name: 'Monat abschließen' })).toBeEnabled();
	await page.getByRole('button', { name: 'Monat abschließen' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Monat abschließen' }).click();
	await expect(page.getByText(/Abgeschlossen bis einschließlich/)).toBeVisible();

	const locked = await submitCorrection(employee.employeeId!).then(
		() => null,
		(error: unknown) => error
	);
	expect(locked).toBeInstanceOf(ApiRequestError);
	expect((locked as ApiRequestError).status).toBe(409);
	expect((locked as ApiRequestError).code).toBe('PERIOD_LOCKED');
});
