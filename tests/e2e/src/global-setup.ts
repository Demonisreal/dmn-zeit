import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import { ApiClient } from './api-client';
import { seedCompany } from './seed/company';
import { seedInvoicing, seedSolo } from './seed/solo';
import type { Seed } from './seed/types';
import { untilNextStep } from './totp';

const seedFile = path.join(__dirname, '../.tmp/seed.json');

async function waitForApi(baseURL: string) {
	const deadline = Date.now() + 60_000;
	for (;;) {
		try {
			const res = await fetch(`${baseURL}/api/health`);
			if (res.ok) return;
		} catch {
			// zeit-test-web/api is still starting, retried below
		}
		if (Date.now() > deadline) {
			throw new Error(
				`${baseURL}/api/health did not answer in time. Is compose.test.yml up ` +
					'("docker compose -f compose.test.yml up -d --wait")?'
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 1_000));
	}
}

export default async function globalSetup(config: FullConfig) {
	const baseURL = config.projects[0]!.use.baseURL!;
	await waitForApi(baseURL);

	// one slug per run keeps repeated local runs against the same up stack from colliding
	const run = Date.now().toString(36);
	const company = await seedCompany(baseURL, run);
	const solo = await seedSolo(baseURL, run);
	const invoicing = await seedInvoicing(baseURL, run);

	// the onboarding above used up the current authenticator step of every persona
	await untilNextStep();
	const { admin, hr, teamLead, employee, secondEmployee } = company;
	await Promise.all(
		[admin, hr, teamLead, employee, secondEmployee, solo.owner, invoicing.owner].map(
			async (persona) => {
				const api = new ApiClient(baseURL);
				await api.login(persona.email, persona.password, persona.totpSecret);
				persona.session = api.sessionCookie();
			}
		)
	);

	const seed: Seed = { baseURL, company, solo, invoicing };
	await mkdir(path.dirname(seedFile), { recursive: true });
	await writeFile(seedFile, JSON.stringify(seed, null, '\t'));
}
