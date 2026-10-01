export type Role = 'employee' | 'team_lead' | 'hr' | 'admin';

export type Persona = {
	email: string;
	password: string;
	totpSecret: string;
	role: Role;
	employeeId: string | null;
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
	// left in status "invited" on purpose, auth.spec.ts completes the setup itself
	invitee: InvitedPersona;
};

export type SoloSeed = {
	slug: string;
	owner: Persona;
	clientId: string;
	projectId: string;
	projectName: string;
};

export type Seed = {
	baseURL: string;
	company: CompanySeed;
	solo: SoloSeed;
};
