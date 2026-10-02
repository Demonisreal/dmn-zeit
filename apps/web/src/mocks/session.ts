import type { Session } from '@zeit/shared';
import type { ProjectWorld } from './projects';

export const mockUser = { email: 'mara.lenz@example.com', password: 'richtiges-passwort' };

export const mockSession: Session = {
	user: {
		id: '3f6c2a9e-8b1d-4c57-9e0a-5d2b7f4a1c38',
		email: mockUser.email,
		displayName: 'Mara Lenz',
		role: 'admin',
		locale: 'de',
		status: 'active',
		employeeId: '8d41b7c2-0e5f-4a93-b6d8-2c7e9f13a054',
		lastLoginAt: null
	},
	tenant: {
		id: 'c2e8f4a1-6b3d-4f70-8a95-1d4c7b2e9f60',
		name: 'Musterbetrieb (Beispiel)',
		kind: 'live',
		workspace: 'company',
		expiresAt: null
	},
	mode: 'live',
	leadsTeams: [],
	security: { enrollmentPending: false, reauthUntil: null },
	csrfToken: 'mock-csrf-token'
};

const soloSession = (
	name: string,
	ids: { user: string; employee: string; tenant: string },
	tenantName: string
): Session => ({
	...mockSession,
	user: {
		...mockSession.user,
		id: ids.user,
		email: `${name.replace(' ', '.').toLowerCase()}@example.com`,
		displayName: name,
		employeeId: ids.employee
	},
	tenant: { ...mockSession.tenant, id: ids.tenant, name: tenantName, workspace: 'solo' },
	csrfToken: `mock-csrf-${ids.user.slice(0, 8)}`
});

const password = mockUser.password;

export const mockAccounts: {
	email: string;
	password: string;
	session: Session;
	world: ProjectWorld;
}[] = [
	{ ...mockUser, session: mockSession, world: 'company' },
	{
		email: 'lena.vogt@example.com',
		password,
		session: soloSession(
			'Lena Vogt',
			{
				user: '6a1d3f8e-2b7c-4e59-a0d4-8c3b9e1f7a25',
				employee: '9f4c2e7a-1d8b-4a36-b5e0-7d2a6c3f9e14',
				tenant: 'd7b3e9a1-4c6f-4e28-9b15-3a8f2d6c1e70'
			},
			'Lena Vogt, Softwareentwicklung (Beispiel)'
		),
		world: 'solo'
	},
	{
		email: 'ole.hansen@example.com',
		password,
		session: soloSession(
			'Ole Hansen',
			{
				user: '2e8b5d1f-7a4c-4b93-8f26-1c9e3a7d5b40',
				employee: '4b7e1a9d-3c5f-4d82-a6b1-9e2c8f4a7d63',
				tenant: 'a3f6c8e2-9d1b-4f57-8e34-6b2d1a9c5f08'
			},
			'Ole Hansen, Fotografie (Beispiel)'
		),
		world: 'solo-empty'
	},
	{
		email: 'nina.berg@example.com',
		password,
		session: soloSession(
			'Nina Berg',
			{
				user: '8c2f6a4e-1b9d-4e73-b5a8-3d7e2c9f1a56',
				employee: '1d9a5c3e-7f2b-4a68-9c41-5e8b3f2d7a19',
				tenant: 'f5e1a7c3-2d8b-4c96-a3f7-8b4e1d6c2a35'
			},
			'Nina Berg, Webentwicklung (Beispiel)'
		),
		world: 'solo-many'
	}
];
