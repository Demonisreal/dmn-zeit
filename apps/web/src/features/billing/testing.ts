import type { Role, Session } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { resetMockBilling } from '../../mocks/billing';
import type { ProjectWorld } from '../../mocks/projects';
import { server } from '../../mocks/server';
import { mockAccounts } from '../../mocks/session';

// the mock accounts are admins, hr sees the same pages without deleting
export function signInForBilling(world: ProjectWorld = 'company', role?: Role) {
	const account = mockAccounts.find((candidate) => candidate.world === world)!;
	const session: Session = role
		? { ...account.session, user: { ...account.session.user, role } }
		: account.session;
	resetMockBilling(world);
	server.use(http.get('/api/auth/session', () => HttpResponse.json(session)));
	return session;
}

export const clientIds = {
	hagen: '3c9f1a70-2e4b-4d18-9a53-000000000001',
	brinkmann: '3c9f1a70-2e4b-4d18-9a53-000000000002'
};

export const projectIds = {
	hagenBooks: '5e21b8d4-6a0f-4c37-8e92-000000000001',
	brinkmannClosing: '5e21b8d4-6a0f-4c37-8e92-000000000003',
	overbeckClosing: '5e21b8d4-6a0f-4c37-8e92-000000000005',
	stadtwerkePortal: '5e21b8d4-6a0f-4c37-8e92-00000000000b'
};

export const invoiceIds = {
	brinkmannIssued: '1f6a2e4c-8d9b-4a37-a05e-000000000001',
	hagenIssued: '1f6a2e4c-8d9b-4a37-a05e-000000000002',
	yilmazDraft: '1f6a2e4c-8d9b-4a37-a05e-000000000003'
};

export const addHostingLine = (invoiceId: string) =>
	fetch(`/api/invoices/${invoiceId}/lines`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			description: 'Hosting-Pauschale',
			quantityMilli: '1000',
			unit: 'C62',
			unitPriceCents: '5000',
			taxCategory: 'standard'
		})
	});
