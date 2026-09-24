import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSession } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { signInForWeek } from './testing';

async function openForm(date: RegExp) {
	renderApp('/');
	const table = await screen.findByRole('table', { name: 'Buchungen KW 39' });
	await userEvent.click(within(table).getByRole('button', { name: date }));
	await userEvent.click(screen.getByRole('button', { name: 'Korrektur beantragen' }));
	return screen.getByRole('form', { name: 'Korrekturantrag' });
}

// the segments of a react-aria time field take digits and jump on by themselves
async function typeTime(form: HTMLElement, label: string, digits: string) {
	const [hour] = within(within(form).getByRole('group', { name: label })).getAllByRole(
		'spinbutton'
	);
	await userEvent.click(hour!);
	await userEvent.keyboard(digits);
}

const capture = () => {
	const sent: unknown[] = [];
	server.use(
		http.post('/api/corrections', async ({ request }) => {
			sent.push(await request.json());
			return HttpResponse.json({}, { status: 201 });
		})
	);
	return sent;
};

describe('correction request', () => {
	beforeEach(() => signInForWeek());
	afterEach(() => vi.useRealTimers());

	it('names what is wrong and sends nothing', async () => {
		const sent = capture();
		const form = await openForm(/22\.09\./);

		await userEvent.type(within(form).getByLabelText('Begründung'), 'vergessen');
		await userEvent.click(within(form).getByRole('button', { name: 'Antrag stellen' }));

		expect(await within(form).findByText('Mindestens 10 Zeichen')).toBeInTheDocument();
		expect(within(form).getByLabelText('Begründung')).toHaveAttribute('aria-invalid', 'true');
		expect(sent).toHaveLength(0);
	});

	it('changes the last entry of the day to a later clock-out', async () => {
		const sent = capture();
		const form = await openForm(/22\.09\./);

		expect(within(form).getByRole('radio', { name: 'Buchung ändern' })).toBeChecked();
		expect(within(form).getByRole('radio', { name: '12:30 bis 17:30' })).toBeChecked();

		await typeTime(form, 'Gehen', '1800');
		expect(within(form).getByText('Dauer 5:30 h')).toBeInTheDocument();
		await userEvent.type(
			within(form).getByLabelText('Begründung'),
			'Bis 18 Uhr beim Mandanten, zu früh ausgestempelt.'
		);
		await userEvent.click(within(form).getByRole('button', { name: 'Antrag stellen' }));

		expect(await screen.findByText(/Korrekturantrag gestellt/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Korrektur beantragen' })).toHaveFocus();
		expect(sent).toEqual([
			{
				action: 'change',
				entryId: '7a3c9e21-4b0d-4f6a-8c2e-202609220002',
				startedAt: '2026-09-22T10:30:00.000Z',
				endedAt: '2026-09-22T16:00:00.000Z',
				reason: 'Bis 18 Uhr beim Mandanten, zu früh ausgestempelt.'
			}
		]);
	});

	it('adds a missed entry that ends after midnight', async () => {
		const sent = capture();
		const form = await openForm(/21\.09\./);

		await userEvent.click(within(form).getByRole('radio', { name: 'Fehlende Buchung nachtragen' }));
		await typeTime(form, 'Kommen', '2230');
		await typeTime(form, 'Gehen', '0045');
		expect(within(form).getByText('Dauer 2:15 h, Gehen am Folgetag')).toBeInTheDocument();
		await userEvent.type(
			within(form).getByLabelText('Begründung'),
			'Fristsache beim Finanzamt, abends von zu Hause gearbeitet.'
		);
		await userEvent.click(within(form).getByRole('button', { name: 'Antrag stellen' }));

		expect(await screen.findByText(/Korrekturantrag gestellt/)).toBeInTheDocument();
		expect(sent).toEqual([
			{
				action: 'add',
				employeeId: mockSession.user.employeeId,
				startedAt: '2026-09-21T20:30:00.000Z',
				endedAt: '2026-09-21T22:45:00.000Z',
				reason: 'Fristsache beim Finanzamt, abends von zu Hause gearbeitet.'
			}
		]);
	});

	it('says so when the month is closed in the meantime', async () => {
		server.use(
			http.post('/api/corrections', () =>
				HttpResponse.json(
					{ code: 'PERIOD_LOCKED', message: 'Month is closed', details: null },
					{ status: 409 }
				)
			)
		);
		const form = await openForm(/21\.09\./);

		await userEvent.click(within(form).getByRole('radio', { name: 'Buchung streichen' }));
		await userEvent.type(within(form).getByLabelText('Begründung'), 'Doppelt eingestempelt.');
		await userEvent.click(within(form).getByRole('button', { name: 'Antrag stellen' }));

		expect(await within(form).findByRole('alert')).toHaveTextContent(
			'Der Monat ist abgeschlossen, Buchungen sind gesperrt.'
		);
	});
});
