import { ApiClient } from '../api-client';
import { seedSql, tenantCreate } from '../docker';
import { PASSWORD } from './constants';
import type { Persona, SoloSeed } from './types';

function tokenFromInviteLink(output: string): string {
	const match = output.trim().match(/#t=([\w-]+)\s*$/);
	if (!match) throw new Error(`no invite link in cli output:\n${output}`);
	return match[1]!;
}

async function onboardOwner(baseURL: string, slug: string, ownerEmail: string) {
	const output = tenantCreate([
		'--workspace',
		'solo',
		'--name',
		'Freelance Playwright',
		'--slug',
		slug,
		'--state',
		'NW',
		'--admin-email',
		ownerEmail,
		'--first-name',
		'Frida',
		'--last-name',
		'Freiberuflich'
	]);

	const api = new ApiClient(baseURL);
	await api.acceptInvitation(tokenFromInviteLink(output), PASSWORD);
	const totpSecret = await api.setUpTotp();
	const owner: Persona = {
		email: ownerEmail,
		password: PASSWORD,
		totpSecret,
		role: 'admin',
		employeeId: null
	};
	return { api, owner };
}

export async function seedSolo(baseURL: string, run: string): Promise<SoloSeed> {
	const slug = `pw-solo-${run}`;
	const { api, owner } = await onboardOwner(baseURL, slug, `solo+${run}@pw.e2e.test`);

	const clientName = 'Musterkundschaft GmbH';
	const client = await api.post<{ id: string }>('/clients', { name: clientName });
	const projectName = 'Website Relaunch';
	const project = await api.post<{ id: string }>('/projects', {
		clientId: client.id,
		name: projectName
	});

	return { slug, owner, clientId: client.id, clientName, projectId: project.id, projectName };
}

// own tenant for the invoice scenario, its authenticator steps belong to the step-up alone
export async function seedInvoicing(baseURL: string, run: string): Promise<SoloSeed> {
	const slug = `pw-invoicing-${run}`;
	const { api, owner } = await onboardOwner(baseURL, slug, `invoicing+${run}@pw.e2e.test`);

	// PATCH /billing/profile asks for a step-up, which would use up the step this persona still needs
	seedSql(`
		insert into app.billing_profiles (tenant_id, legal_name, street, postal_code, city, tax_number, iban, bank_name)
		select id, 'Frida Freiberuflich', 'Lindenallee 12', '50667', 'Köln', '214/5678/9012',
			'DE89370400440532013000', 'Beispielbank'
		from app.tenants where slug = '${slug}';
	`);

	const clientName = 'Hofmann Maschinenbau GmbH';
	const client = await api.post<{ id: string }>('/clients', {
		name: clientName,
		street: 'Werkstraße 4',
		postalCode: '40213',
		city: 'Düsseldorf'
	});
	const projectName = 'Konstruktionsdaten migrieren';
	const project = await api.post<{ id: string }>('/projects', {
		clientId: client.id,
		name: projectName
	});
	await api.post('/rates', { validFrom: '2026-01-01', rateCents: '9500' });

	return { slug, owner, clientId: client.id, clientName, projectId: project.id, projectName };
}
