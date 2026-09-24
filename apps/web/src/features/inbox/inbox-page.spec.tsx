import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
