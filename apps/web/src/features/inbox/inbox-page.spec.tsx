import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Absence } from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { signInAs } from '../absences/test-session';

const steuerberatung = { id: 'e1f9ecbb-e6ff-4aa4-b29b-703459281a47', name: 'Steuerberatung' };

// the first render compiles the lazy route, in a full parallel run that can take over a second
const openInbox = (first: string) => {
	renderApp('/inbox');
	return screen.findByRole('region', { name: first }, { timeout: 4000 });
};

const section = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) });

// the decision buttons are grouped under the name of the request, the list item holds the details
const request = (name: RegExp) => screen.getByRole('group', { name }).closest('li')!;

const jonas = { id: 'f4fa8137-2571-4add-ba96-add65c1f7104', name: 'Jonas Brandt' };
const lea = { id: '60f75051-d386-4bd1-912a-74a882f967e8', name: 'Lea Schwerdtfeger' };

const leaveOfDeniz = (fields: Partial<Absence> = {}): Absence => ({
	id: '3b8d5f2e-7a41-4c69-9e0d-6f2a8c1b4e75',
	employee: { id: 'bc1e61b4-d3d8-4290-9124-bc7adf87efde', name: 'Deniz Aydın' },
	type: 'vacation',
	startDate: '2026-10-19',
	endDate: '2026-10-23',
	halfDayStart: false,
	halfDayEnd: false,
	status: 'pending',
	note: null,
	vacationDays: '5.00',
	targetMinutes: 2340,
	requestedBy: { id: '9e54ff3b-ee67-48c7-8424-9364dabd4b90', displayName: 'Deniz Aydın' },
	decidedBy: null,
	decidedAt: null,
	decisionNote: null,
	sickNote: null,
	createdAt: '2026-09-20T10:00:00+02:00',
	...fields
});

const timeOffOfJonas = (fields: Partial<Absence> = {}): Absence => ({
	...leaveOfDeniz(),
	id: '8e1c4a7d-2f96-4b3e-a5d8-0c7f9b2e6a13',
	employee: jonas,
	type: 'time_off',
	startDate: '2026-10-05',
	endDate: '2026-10-05',
	vacationDays: '0.00',
	targetMinutes: 468,
	requestedBy: { id: '30593c7c-95be-42e3-a23b-060f9bab7fa0', displayName: jonas.name },
	...fields
});

const inboxWith = (...items: Absence[]) =>
	server.use(http.get('/api/absences', () => HttpResponse.json({ items, nextCursor: null })));

describe('inbox', () => {
	afterEach(() => {
		vi.useRealTimers();
		server.events.removeAllListeners();
	});

	it('approves a leave request in one step', async () => {
		signInAs('team_lead', [steuerberatung]);
		const absences = await openInbox('Abwesenheiten 5');
		expect(within(absences).getAllByRole('listitem')).toHaveLength(5);
		expect(
			within(request(/^Tobias Kämmerer, Urlaub/)).getByText('Stornierung beantragt')
		).toBeInTheDocument();

		const deniz = request(/^Deniz Aydın, Urlaub 19\.–30\.10\.2026/);
		expect(deniz).toHaveTextContent('10,00 Urlaubstage');
		expect(deniz).toHaveTextContent('Herbstferien mit den Kindern.');
		await userEvent.click(within(deniz).getByRole('button', { name: 'Genehmigen' }));

		expect(await screen.findByText('Antrag von Deniz Aydın genehmigt.')).toBeInTheDocument();
		expect(await screen.findByRole('region', { name: 'Abwesenheiten 4' })).toBeInTheDocument();
		expect(screen.queryByRole('group', { name: /^Deniz Aydın, Urlaub/ })).not.toBeInTheDocument();
	});

	it('names a cancellation as such, not only by its tag', async () => {
		signInAs('team_lead', [steuerberatung]);
		await openInbox('Abwesenheiten 5');
		const tobias = screen.getByRole('group', {
			name: /^Tobias Kämmerer, Urlaub .+, Stornierung beantragt$/
		});

		await userEvent.click(within(tobias).getByRole('button', { name: 'Stornierung genehmigen' }));

		expect(
			await screen.findByText('Stornierung von Tobias Kämmerer genehmigt.')
		).toBeInTheDocument();
		expect(screen.queryByText('Antrag von Tobias Kämmerer genehmigt.')).not.toBeInTheDocument();
	});

	it('lists open requests however far ahead they lie', async () => {
		signInAs('team_lead', [steuerberatung]);
		const later = {
			id: '5c2e8f1a-9d47-4b36-a0e1-7f3b6d2c9a58',
			employee: { id: 'bc1e61b4-d3d8-4290-9124-bc7adf87efde', name: 'Deniz Aydın' },
			type: 'vacation',
			startDate: '2028-08-07',
			endDate: '2028-08-11',
			halfDayStart: false,
			halfDayEnd: false,
			status: 'pending',
			note: null,
			vacationDays: '5.00',
			targetMinutes: 2340,
			requestedBy: { id: '9e54ff3b-ee67-48c7-8424-9364dabd4b90', displayName: 'Deniz Aydın' },
			decidedBy: null,
			decidedAt: null,
			decisionNote: null,
			sickNote: null,
			createdAt: '2026-09-20T10:00:00+02:00'
		};
		// the api applies a range whenever one is sent
		server.use(
			http.get('/api/absences', ({ request }) => {
				const to = new URL(request.url).searchParams.get('to');
				const items = to !== null && to < later.startDate ? [] : [later];
				return HttpResponse.json({ items, nextCursor: null });
			})
		);

		const absences = await openInbox('Abwesenheiten 1');

		expect(within(absences).getByRole('group', { name: /^Deniz Aydın, Urlaub/ })).toBeVisible();
	});

	it('adds the leave left and who else is away to a leave request', async () => {
		signInAs('team_lead', [steuerberatung]);
		inboxWith(
			leaveOfDeniz({
				remainingAfter: '20.00',
				concurrentAbsences: [
					{ employee: jonas, startDate: '2026-10-19', endDate: '2026-10-20' },
					{ employee: lea, startDate: '2026-10-22', endDate: '2026-10-22' }
				]
			})
		);
		await openInbox('Abwesenheiten 1');

		expect(request(/^Deniz Aydın, Urlaub/)).toHaveTextContent(
			'Resturlaub danach: 20,00 Tage · Gleichzeitig abwesend: Jonas Brandt (19.–20.10.2026) und Lea Schwerdtfeger (22.10.2026)'
		);
	});

	it('shows the flextime balance a time-off request leaves', async () => {
		signInAs('team_lead', [steuerberatung]);
		inboxWith(timeOffOfJonas({ balanceAfterMinutes: -90, concurrentAbsences: [] }));
		await openInbox('Abwesenheiten 1');

		expect(
			within(request(/^Jonas Brandt, Zeitausgleich/)).getByText('Gleitzeitsaldo danach: −1:30 h')
		).toBeInTheDocument();
	});

	it('adds no extra line when the api sends no context', async () => {
		signInAs('team_lead', [steuerberatung]);
		inboxWith(leaveOfDeniz({ remainingAfter: null, concurrentAbsences: [] }), timeOffOfJonas());
		await openInbox('Abwesenheiten 2');
		const lines = (item: HTMLElement) =>
			Array.from(item.querySelectorAll('p'), (line) => line.textContent);

		expect(lines(request(/^Deniz Aydın, Urlaub/))).toEqual([
			'Deniz Aydın',
			expect.stringContaining('5,00 Urlaubstage'),
			'gestellt am 20.09.2026'
		]);
		expect(lines(request(/^Jonas Brandt, Zeitausgleich/))).toEqual([
			'Jonas Brandt',
			expect.stringContaining('7:48 h'),
			'gestellt am 20.09.2026'
		]);
	});

	it('does not reject without a reason', async () => {
		let sent = 0;
		server.events.on('request:start', ({ request: outgoing }) => {
			if (outgoing.url.endsWith('/reject')) sent++;
		});
		signInAs('team_lead', [steuerberatung]);
		await openInbox('Abwesenheiten 5');
		const lea = request(/^Lea Schwerdtfeger, Urlaub/);

		await userEvent.click(within(lea).getByRole('button', { name: 'Ablehnen' }));
		const reason = within(lea).getByLabelText('Begründung für die Ablehnung');
		expect(reason).toHaveFocus();
		await userEvent.click(within(lea).getByRole('button', { name: 'Ablehnung senden' }));

		expect(
			await within(lea).findByText('Beim Ablehnen ist eine Begründung Pflicht.')
		).toBeInTheDocument();
		expect(reason).toHaveAttribute('aria-invalid', 'true');
		expect(sent).toBe(0);

		await userEvent.type(reason, 'In der Woche ist die Betriebsprüfung, bitte eine Woche später.');
		await userEvent.click(within(lea).getByRole('button', { name: 'Ablehnung senden' }));

		expect(await screen.findByText('Antrag von Lea Schwerdtfeger abgelehnt.')).toBeInTheDocument();
		expect(sent).toBe(1);
	});

	it('says why a decision did not go through', async () => {
		signInAs('team_lead', [steuerberatung]);
		server.use(
			http.post('/api/absences/:id/approve', () =>
				HttpResponse.json(
					{ code: 'INVALID_STATE', message: 'Request is no longer open', details: null },
					{ status: 409 }
				)
			)
		);
		await openInbox('Abwesenheiten 5');
		const helin = request(/^Helin Demir/);

		await userEvent.click(within(helin).getByRole('button', { name: 'Genehmigen' }));

		expect(await within(helin).findByRole('alert')).toHaveTextContent(
			'Der Antrag ist inzwischen entschieden oder zurückgezogen.'
		);
	});

	it('shows corrections as before and after', async () => {
		signInAs('team_lead', [steuerberatung]);
		await openInbox('Korrekturen 4');

		const jonas = request(/^Jonas Brandt, Änderung/);
		const [before, after] = within(jonas).getAllByRole('definition');
		expect(before).toHaveTextContent('08:03 – offen');
		expect(after).toHaveTextContent('08:03 – 16:41 8:38 h');
		expect(within(after!).getByText('16:41')).toHaveAttribute('data-changed', 'true');
		expect(within(after!).getByText('08:03')).not.toHaveAttribute('data-changed');

		// the shift runs past midnight in Berlin
		const tobias = request(/^Tobias Kämmerer, Änderung/);
		expect(within(tobias).getAllByRole('definition')[1]).toHaveTextContent(
			'20:30 – 00:45 +1 Tag 4:15 h'
		);
		expect(
			within(request(/^Lea Schwerdtfeger, Nachtrag/)).getAllByRole('definition')[0]
		).toHaveTextContent('keine Buchung');
		expect(
			within(request(/^Deniz Aydın, Streichung/)).getAllByRole('definition')[1]
		).toHaveTextContent('entfällt');

		await userEvent.click(within(jonas).getByRole('button', { name: 'Genehmigen' }));
		expect(await screen.findByText('Antrag von Jonas Brandt genehmigt.')).toBeInTheDocument();
		expect(await screen.findByRole('region', { name: 'Korrekturen 3' })).toBeInTheDocument();
	});

	it('lets only hr confirm medical certificates', async () => {
		signInAs('team_lead', [steuerberatung]);
		await openInbox('Abwesenheiten 5');
		expect(screen.queryByRole('heading', { name: 'Atteste' })).not.toBeInTheDocument();
	});

	it('confirms a medical certificate as hr', async () => {
		signInAs('hr');
		const notes = await openInbox('Atteste 2');

		await userEvent.click(
			within(notes).getByRole('button', {
				name: 'Attest bestätigen: Tobias Kämmerer, 21.–25.09.2026'
			})
		);

		expect(
			await screen.findByText(
				'Attest von Tobias Kämmerer bestätigt. Urlaubstage im Zeitraum werden zurückgebucht.'
			)
		).toBeInTheDocument();
		await waitFor(() => expect(section('Atteste')).toHaveAccessibleName('Atteste 1'));
	});

	it('never offers hr a button to confirm their own certificate', async () => {
		signInAs('hr');
		const own = {
			id: 'a0d3a6bb-6d3a-4b39-9f3f-5a6e8d1c2b40',
			employee: { id: '8d41b7c2-0e5f-4a93-b6d8-2c7e9f13a054', name: 'Mara Lenz' },
			type: 'sick',
			startDate: '2026-09-21',
			endDate: '2026-09-22',
			halfDayStart: false,
			halfDayEnd: false,
			status: 'approved',
			note: null,
			vacationDays: '0.00',
			targetMinutes: 936,
			requestedBy: { id: '8d41b7c2-0e5f-4a93-b6d8-2c7e9f13a054', displayName: 'Mara Lenz' },
			decidedBy: null,
			decidedAt: null,
			decisionNote: null,
			sickNote: null,
			createdAt: '2026-09-21T08:00:00+02:00'
		};
		server.use(
			http.get('/api/absences', ({ request }) => {
				const type = new URL(request.url).searchParams.getAll('type');
				const items = type.includes('sick') ? [own] : [];
				return HttpResponse.json({ items, nextCursor: null });
			})
		);
		const notes = await openInbox('Atteste 0');

		expect(within(notes).queryByRole('button', { name: /Attest bestätigen/ })).toBeNull();
	});
});
