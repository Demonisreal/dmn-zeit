export type Role = 'employee' | 'team_lead' | 'hr' | 'admin';

export type Persona = {
	email: string;
	password: string;
	totpSecret: string;
	role: Role;
	employeeId: string | null;
	// filled by global-setup, a login per test would reuse an authenticator step the parallel workers share
	session?: string;
};

export type InvitedPersona = {
	email: string;
	inviteToken: string;
	role: Role;
};

export type CompanySeed = {
	tenantId: string;
	slug: string;
	teamId: string;
	workModelId: string;
	admin: Persona;
	hr: Persona;
	teamLead: Persona;
	employee: Persona;
	// a second person with a clock: the mobile project stamps it next to the desktop run, months.spec leaves its blocker on it
	secondEmployee: Persona;
	// stays invited for auth.spec.ts, one per project because an invitation works only once
	invitee: InvitedPersona;
	mobileInvitee: InvitedPersona;
};

export type SoloSeed = {
	slug: string;
	owner: Persona;
	clientId: string;
	clientName: string;
	projectId: string;
	projectName: string;
};

export type Seed = {
	baseURL: string;
	company: CompanySeed;
	solo: SoloSeed;
	invoicing: SoloSeed;
};
