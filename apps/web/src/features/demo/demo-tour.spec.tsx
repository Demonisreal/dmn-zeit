import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Absence, AbsenceStatus, AbsenceType } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSandbox } from '../../lib/api/demo';
import { queryClient, sessionKey } from '../../lib/api/query-client';
import { resetMockDemo } from '../../mocks/demo';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { currentMonth, shiftMonth } from '../hr/dates';
import { markTourStep } from './tour';

const jonas = { id: '5d8f2c41-7a3e-4b96-8e10-2f4c9a7b3d65', name: 'Jonas Brandt' };
const katrin = { id: '9b1e6d30-4c2a-4f87-a5d9-7e3b0c8f2a14', displayName: 'Katrin Hölscher' };

// the seed dates everything back, only what happens in the sandbox lies after its start
const seeded = '2026-08-20T09:12:00+02:00';
const later = () => new Date(Date.now() + 1000).toISOString();

const leave = (
	type: AbsenceType,
	status: AbsenceStatus,
	createdAt: string,
	decidedAt: string | null = null
): Absence => ({
	id: crypto.randomUUID(),
	employee: jonas,
	type,
	startDate: '2026-10-12',
	endDate: '2026-10-14',
	halfDayStart: false,
	halfDayEnd: false,
	status,
	note: null,
	vacationDays: type === 'vacation' ? '3.00' : '0.00',
	targetMinutes: 1440,
	requestedBy: { id: '0c7a4e19-3b58-4d21-9f6e-8a2d5b1c7e03', displayName: jonas.name },
	decidedBy: decidedAt ? katrin : null,
	decidedAt,
	decisionNote: null,
	sickNote: null,
	createdAt
});

const answer = (byScope: Record<string, () => Absence[]>) =>
	server.use(
		http.get('/api/absences', ({ request }) => {
			const scope = new URL(request.url).searchParams.get('scope') ?? 'mine';
			return HttpResponse.json({ items: byScope[scope]?.() ?? [], nextCursor: null });
		})
	);

const closing = (closed: boolean) => {
	const asked: string[] = [];
	server.use(
		http.get('/api/months/:month/checklist', ({ params }) => {
			asked.push(String(params.month));
			return HttpResponse.json({
				month: params.month,
				closed,
				closable: false,
				items: [],
				capPreview: []
			});
		})
	);
	return asked;
};

const startSandbox = async () =>
	queryClient.setQueryData(sessionKey, await createSandbox({ locale: 'de' }));

const tourToggle = () => screen.findByRole('button', { name: /^Rundgang/ });

const steps = async () =>
	within(await screen.findByRole('list', { name: 'Rundgang' })).getAllByRole('listitem');

const switchTo = async (role: string) => {
	const [trigger] = await screen.findAllByRole('button', { name: 'Rolle wechseln' });
	await userEvent.click(trigger!);
	const menu = await screen.findByRole('menu', { name: 'Rolle wechseln' });
	await userEvent.click(await within(menu).findByRole('menuitemradio', { name: role }));
};

describe('demo tour', () => {
	beforeEach(() => {
		sessionStorage.clear();
		resetMockDemo('demo');
		closing(false);
	});

	it('lists four steps and leaves out what the seed already holds', async () => {
		answer({
			mine: () => [
				leave('vacation', 'approved', seeded, seeded),
				leave('vacation', 'pending', seeded)
			]
		});
		await startSandbox();
		renderApp('/');

		expect(await tourToggle()).toHaveAccessibleName('Rundgang 0 von 4');
		expect(await tourToggle()).toHaveAttribute('aria-expanded', 'true');
		expect((await steps()).map((step) => step.textContent)).toEqual([
			'Urlaub beantragen, offen als Beschäftigte',
			'Antrag genehmigen, offen als Teamleitung',
			'Ruhezeit nach § 5 im Wochenbuch finden, offen als Beschäftigte',
			'Monat abschließen, offen als Personalverwaltung'
		]);
	});

	it('ticks a leave request made in the sandbox', async () => {
		answer({ mine: () => [leave('vacation', 'pending', later())] });
		await startSandbox();
		renderApp('/');

		expect(await screen.findByRole('button', { name: 'Rundgang 1 von 4' })).toBeInTheDocument();
		expect((await steps())[0]).toHaveTextContent('Urlaub beantragen, erledigt');
	});

	it('keeps the approval ticked for a persona who cannot see it', async () => {
		// someone else's request, only the team lead's scope shows it
		answer({ all: () => [leave('time_off', 'approved', seeded, later())] });
		await startSandbox();
		renderApp('/');
		expect(await screen.findByRole('button', { name: 'Rundgang 0 von 4' })).toBeInTheDocument();

		await switchTo('Teamleitung');
		expect(await screen.findByRole('heading', { name: 'Posteingang' })).toBeInTheDocument();
		expect(await screen.findByRole('button', { name: 'Rundgang 1 von 4' })).toBeInTheDocument();

		await switchTo('Beschäftigte');
		expect(await screen.findByRole('button', { name: 'Jonas Brandt' })).toBeInTheDocument();
		expect(await screen.findByRole('button', { name: 'Rundgang 1 von 4' })).toBeInTheDocument();
		expect((await steps())[1]).toHaveTextContent('Antrag genehmigen, erledigt');
	});

	it('asks hr whether the month the seed left open is closed now', async () => {
		answer({});
		const asked = closing(true);
		await startSandbox();
		renderApp('/');

		await switchTo('Personalverwaltung');

		expect(await screen.findByRole('heading', { name: 'Monatsabschluss' })).toBeInTheDocument();
		expect(await screen.findByRole('button', { name: 'Rundgang 1 von 4' })).toBeInTheDocument();
		expect((await steps())[3]).toHaveTextContent('Monat abschließen, erledigt');
		expect(asked).toContain(shiftMonth(currentMonth(), -1));
	});

	it('ticks the week step when another page marks it', async () => {
		answer({});
		await startSandbox();
		renderApp('/');
		expect(await screen.findByRole('button', { name: 'Rundgang 0 von 4' })).toBeInTheDocument();

		act(() => markTourStep('restFinding'));

		expect(await screen.findByRole('button', { name: 'Rundgang 1 von 4' })).toBeInTheDocument();
		expect((await steps())[2]).toHaveTextContent(
			'Ruhezeit nach § 5 im Wochenbuch finden, erledigt'
		);
	});

	it('adds the invoice step only to the freelancer tour', async () => {
		answer({});
		await startSandbox();
		renderApp('/');
		expect(await screen.findByRole('button', { name: 'Rundgang 0 von 4' })).toBeInTheDocument();

		await switchTo('Freelancer');
		expect(await screen.findByRole('button', { name: 'Rundgang 0 von 5' })).toBeInTheDocument();
		expect((await steps()).map((step) => step.textContent)).toEqual([
			'Urlaub beantragen, offen als Beschäftigte',
			'Antrag genehmigen, offen als Teamleitung',
			'Ruhezeit nach § 5 im Wochenbuch finden, offen als Beschäftigte',
			'Monat abschließen, offen als Personalverwaltung',
			'Rechnung ausstellen, offen als Freelancer'
		]);

		act(() => markTourStep('invoice'));
		expect(await screen.findByRole('button', { name: 'Rundgang 1 von 5' })).toBeInTheDocument();
		expect((await steps())[4]).toHaveTextContent('Rechnung ausstellen, erledigt');

		await switchTo('Beschäftigte');
		expect(await screen.findByRole('button', { name: 'Rundgang 0 von 4' })).toBeInTheDocument();
		expect(await steps()).toHaveLength(4);
	});

	it('reads the week step straight from session storage too', async () => {
		answer({});
		sessionStorage.setItem('zeit.demo.restFinding', '1');
		await startSandbox();
		renderApp('/');

		expect(await screen.findByRole('button', { name: 'Rundgang 1 von 4' })).toBeInTheDocument();
	});

	it('stays folded after a reload once folded', async () => {
		answer({});
		await startSandbox();
		renderApp('/');

		await userEvent.click(await tourToggle());
		expect(await tourToggle()).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByRole('list', { name: 'Rundgang' })).not.toBeInTheDocument();

		cleanup();
		renderApp('/');
		expect(await tourToggle()).toHaveAttribute('aria-expanded', 'false');
	});

	it('starts over for a new sandbox in the same tab', async () => {
		answer({});
		sessionStorage.setItem('zeit.demo.restFinding', '1');
		sessionStorage.setItem('zeit.demo.tour', 'closed');
		renderApp('/login');

		await userEvent.click(await screen.findByRole('button', { name: 'Demo starten' }));

		expect(await screen.findByRole('button', { name: 'Rundgang 0 von 4' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
	});
});
