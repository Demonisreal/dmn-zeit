import { ApiClient } from '../api-client';
import { tenantCreate } from '../docker';
import { PASSWORD } from './constants';
import type { Persona, SoloSeed } from './types';

function tokenFromInviteLink(output: string): string {
	const match = output.trim().match(/#t=([\w-]+)\s*$/);
	if (!match) throw new Error(`no invite link in cli output:\n${output}`);
	return match[1]!;
}

export async function seedSolo(baseURL: string, run: string): Promise<SoloSeed> {
	const slug = `pw-solo-${run}`;
	const ownerEmail = `solo+${run}@pw.e2e.test`;
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

	await api.login(owner.email, owner.password, owner.totpSecret);
	const client = await api.post<{ id: string }>('/clients', { name: 'Musterkundschaft GmbH' });
	const projectName = 'Website Relaunch';
	const project = await api.post<{ id: string }>('/projects', {
		clientId: client.id,
		name: projectName
	});

	return { slug, owner, clientId: client.id, projectId: project.id, projectName };
}
