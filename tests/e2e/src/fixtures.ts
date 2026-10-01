import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test as base, expect, type Browser, type BrowserContext } from '@playwright/test';
import { ApiClient } from './api-client';
import type { Persona, Seed } from './seed/types';

const seed: Seed = JSON.parse(readFileSync(path.join(__dirname, '../.tmp/seed.json'), 'utf8'));

// logs a persona in through the api and drops the session cookie into the browser context; the ui
// login flow itself only gets exercised where a scenario is actually about logging in, see auth.spec.ts
export async function loginInto(context: BrowserContext, baseURL: string, persona: Persona) {
	const api = new ApiClient(baseURL);
	await api.login(persona.email, persona.password, persona.totpSecret);
	await context.addCookies([{ name: 'zeit_sid', value: api.sessionCookie(), url: baseURL }]);
}

// a second identity next to the test's own page, e.g. the team lead deciding on what the employee sent
export async function secondSession(browser: Browser, baseURL: string, persona: Persona) {
	const context = await browser.newContext();
	await context.addInitScript(() => localStorage.setItem('zeit.lang', 'de'));
	await loginInto(context, baseURL, persona);
	return context;
}

type Fixtures = {
	signIn: (persona: Persona) => Promise<void>;
};

export const test = base.extend<Fixtures>({
	// the app picks up the browser language before login, de-DE alone is not enough for a stored choice
	context: async ({ context }, use) => {
		await context.addInitScript(() => localStorage.setItem('zeit.lang', 'de'));
		await use(context);
	},
	signIn: async ({ context, baseURL }, use) => {
		await use((persona) => loginInto(context, baseURL!, persona));
	}
});

export { expect, seed };
