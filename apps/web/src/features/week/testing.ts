import type { Role, Session, VacationAccount } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import { mockSession } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { resetMockWeek, weekHandlers } from '../../mocks/week';

// thursday 10:30 in week 39, the mock week is laid out around the current date
export const testNow = new Date('2026-09-24T10:30:00+02:00');

const leave: VacationAccount = {
	employeeId: mockSession.user.employeeId!,
	year: 2026,
	entitlement: { days: '30.00', explanations: [] },
	buckets: [],
	pending: '3.00',
	available: '11.00',
	ledger: []
};

// only Date is faked, timers stay real so user-event and msw keep working
export function signInForWeek(
	role: Role = 'employee',
	employeeId = mockSession.user.employeeId,
	mode: Session['mode'] = 'live'
) {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(testNow);
	resetMockWeek();
	const session: Session = {
		...mockSession,
		user: { ...mockSession.user, role, employeeId },
		mode
	};
	server.use(
		http.get('/api/auth/session', () => HttpResponse.json(session)),
		...weekHandlers,
		http.get('/api/absences', () => HttpResponse.json({ items: [], nextCursor: null })),
		http.get('/api/employees/:id/vacation', () => HttpResponse.json(leave))
	);
}
