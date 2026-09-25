import type { Session } from '@zeit/shared';

// own module so hr.ts and admin.ts can import it without a cycle through handlers.ts
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
