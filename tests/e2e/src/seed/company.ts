import { ApiClient } from '../api-client';
import { tenantCreate, seedSql } from '../docker';
import { totpCode, untilNextStep } from '../totp';
import { PASSWORD } from './constants';
import { mintInviteToken } from './invite';
import type { CompanySeed, Persona, Role } from './types';

// the cli prints the invite link last, "<origin>/invite#t=<token>"
function tokenFromInviteLink(output: string): string {
	const match = output.trim().match(/#t=([\w-]+)\s*$/);
	if (!match) throw new Error(`no invite link in cli output:\n${output}`);
	return match[1]!;
}

// accepts an invitation and sets up the authenticator app, exactly what auth.spec.ts drives through the ui
async function onboard(
	baseURL: string,
	email: string,
	role: Role,
	employeeId: string | null,
	token: string
) {
	const api = new ApiClient(baseURL);
	await api.acceptInvitation(token, PASSWORD);
	const totpSecret = await api.setUpTotp();
	const persona: Persona = { email, password: PASSWORD, totpSecret, role, employeeId };
	return { persona, api };
}

// the january job books this normally, a person hired today has to get its 2026 bucket by hand
function seedEntitlement(tenantId: string, employeeId: string) {
	seedSql(`
		insert into app.vacation_ledger (tenant_id, employee_id, bucket_year, entry_type, days, effective_date, dedupe_key)
		select '${tenantId}'::uuid, '${employeeId}'::uuid, 2026, 'entitlement', 30.00, '2026-01-01',
			'e2e-entitlement:${employeeId}:2026';
	`);
}

export async function seedCompany(baseURL: string, run: string): Promise<CompanySeed> {
	const slug = `pw-company-${run}`;
	const adminEmail = `admin+${run}@pw.e2e.test`;
	const output = tenantCreate([
		'--name',
		'Playwright Steuerbüro',
		'--slug',
		slug,
		'--state',
		'NW',
		'--admin-email',
		adminEmail,
		'--admin-name',
		'Anke Admin'
	]);
	const { persona: admin, api } = await onboard(
		baseURL,
		adminEmail,
		'admin',
		null,
		tokenFromInviteLink(output)
	);
	const tenant = await api.get<{ id: string }>('/tenant');

	const { id: workModelId } = await api.post<{ id: string }>('/work-models', {
		name: 'Vollzeit 5 Tage',
		minutes: { mon: 480, tue: 480, wed: 480, thu: 480, fri: 480, sat: 0, sun: 0 }
	});
	const { id: teamId } = await api.post<{ id: string }>('/teams', { name: 'Team Playwright' });

	const contract = {
		workModelId,
		vacationDaysYear: '30.0',
		vacationBasisDays: 5,
		flexCapPlusMinutes: null,
		flexCapMinusMinutes: null
	};
	const teamLeadEmployee = await api.post<{ id: string }>('/employees', {
		personnelNo: 'PW-TL',
		firstName: 'Tanja',
		lastName: 'Teamleitung',
		teamId,
		entryDate: '2026-01-01',
		contract
	});
	const employeeEmployee = await api.post<{ id: string }>('/employees', {
		personnelNo: 'PW-EMP',
		firstName: 'Erik',
		lastName: 'Beschäftigt',
		teamId,
		entryDate: '2026-01-01',
		contract
	});

	const secondEmployeeRecord = await api.post<{ id: string }>('/employees', {
		personnelNo: 'PW-2ND',
		firstName: 'Zoe',
		lastName: 'Zweit',
		teamId,
		entryDate: '2026-01-01',
		contract
	});

	// creating users wants a fresh step-up, the onboarding used up the current authenticator step
	await untilNextStep();
	await api.post('/auth/reauth', { password: PASSWORD, code: totpCode(admin.totpSecret) });

	const teamLeadUser = await api.post<{ id: string; email: string }>('/users', {
		email: `teamlead+${run}@pw.e2e.test`,
		displayName: 'Tanja Teamleitung',
		role: 'team_lead',
		employeeId: teamLeadEmployee.id
	});
	const employeeUser = await api.post<{ id: string; email: string }>('/users', {
		email: `employee+${run}@pw.e2e.test`,
		displayName: 'Erik Beschäftigt',
		role: 'employee',
		employeeId: employeeEmployee.id
	});
	const secondEmployeeUser = await api.post<{ id: string; email: string }>('/users', {
		email: `second+${run}@pw.e2e.test`,
		displayName: 'Zoe Zweit',
		role: 'employee',
		employeeId: secondEmployeeRecord.id
	});
	const hrUser = await api.post<{ id: string; email: string }>('/users', {
		email: `hr+${run}@pw.e2e.test`,
		displayName: 'Hanna Personal',
		role: 'hr',
		employeeId: null
	});
	const inviteeUser = await api.post<{ id: string; email: string }>('/users', {
		email: `invite+${run}@pw.e2e.test`,
		displayName: 'Ines Neu',
		role: 'employee',
		employeeId: null
	});
	const mobileInviteeUser = await api.post<{ id: string; email: string }>('/users', {
		email: `invite-mobile+${run}@pw.e2e.test`,
		displayName: 'Mara Neu',
		role: 'employee',
		employeeId: null
	});

	await api.put(`/teams/${teamId}/leads`, { userIds: [teamLeadUser.id] });

	seedEntitlement(tenant.id, teamLeadEmployee.id);
	seedEntitlement(tenant.id, employeeEmployee.id);

	const [
		{ persona: teamLead },
		{ persona: employee },
		{ persona: secondEmployee },
		{ persona: hr }
	] = await Promise.all([
		onboard(
			baseURL,
			teamLeadUser.email,
			'team_lead',
			teamLeadEmployee.id,
			mintInviteToken(teamLeadUser.id)
		),
		onboard(
			baseURL,
			employeeUser.email,
			'employee',
			employeeEmployee.id,
			mintInviteToken(employeeUser.id)
		),
		onboard(
			baseURL,
			secondEmployeeUser.email,
			'employee',
			secondEmployeeRecord.id,
			mintInviteToken(secondEmployeeUser.id)
		),
		onboard(baseURL, hrUser.email, 'hr', null, mintInviteToken(hrUser.id))
	]);

	return {
		tenantId: tenant.id,
		slug,
		teamId,
		workModelId,
		admin,
		hr,
		teamLead,
		employee,
		secondEmployee,
		invitee: {
			email: inviteeUser.email,
			inviteToken: mintInviteToken(inviteeUser.id),
			role: 'employee'
		},
		mobileInvitee: {
			email: mobileInviteeUser.email,
			inviteToken: mintInviteToken(mobileInviteeUser.id),
			role: 'employee'
		}
	};
}
