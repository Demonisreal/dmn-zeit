import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Role, Session } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import { teamIds } from '../../mocks/hr';
import { resetMockProjects, type ProjectWorld } from '../../mocks/projects';
import { server } from '../../mocks/server';
import { mockAccounts } from '../../mocks/session';
import { resetMockWeek } from '../../mocks/week';
import { testNow } from '../week/testing';

// thursday 10:30 in week 39 like the week specs; only Date is faked, msw and user-event need real timers
export function signInForProjects(world: ProjectWorld = 'company', role?: Role) {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(testNow);
	resetMockWeek();
	const account = mockAccounts.find((candidate) => candidate.world === world)!;
	const session: Session = role
		? {
				...account.session,
				user: { ...account.session.user, role },
				leadsTeams: role === 'team_lead' ? [{ id: teamIds.tax, name: 'Steuerberatung' }] : []
			}
		: account.session;
	resetMockProjects(world, session.user.role);
	server.use(http.get('/api/auth/session', () => HttpResponse.json(session)));
	return session;
}

// the segments of a react-aria date or time field take digits and jump on by themselves
export async function typeSegments(form: HTMLElement, label: string, digits: string) {
	const [first] = within(within(form).getByRole('group', { name: label })).getAllByRole(
		'spinbutton'
	);
	await userEvent.click(first!);
	await userEvent.keyboard(digits);
}
