import type { Role, Session } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import { absenceHandlers, resetMockAbsences } from '../../mocks/absences';
import { mockSession } from '../../mocks/handlers';
import { server } from '../../mocks/server';

// only Date is faked, the sample company's requests sit around this Thursday
export function signInAs(role: Role, leadsTeams: Session['leadsTeams'] = []) {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-24T08:00:00Z'));
	resetMockAbsences();
	server.use(
		http.get('/api/auth/session', () =>
			HttpResponse.json({ ...mockSession, user: { ...mockSession.user, role }, leadsTeams })
		),
		...absenceHandlers
	);
}
