import { absenceSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { expectContract, startApi, type Api } from '../auth/api';
import { grant, ledger, office, today, type Member, type Office } from './office';

let api: Api;
let o: Office;

beforeAll(async () => {
	api = await startApi();
	o = await office(api);
	await grant(api, o.worker, 2026, '30.00');
	await grant(api, o.colleague, 2025, '3.00');
	await grant(api, o.colleague, 2026, '30.00');
});

afterAll(() => api.app.close());

async function file(person: Member, type: string, startDate: string, endDate: string) {
	const answer = await person.desk.post('/absences', {
		employeeId: person.employeeId,
		type,
		startDate,
		endDate
	});
	expect(answer.status).toBe(201);
	return answer.body.id as string;
}

async function days(absenceId: string) {
	const { rows } = await api.superuser.query(
		`select date::text, superseded_by from app.absence_days where absence_id = $1 order by date`,
		[absenceId]
	);
	return rows as { date: string; superseded_by: string | null }[];
}

describe('POST /api/absences/:id/confirm-sick-note', () => {
	let vacation: string;
	let sick: string;

	it('leaves vacation under a new sick note alone until hr has the certificate', async () => {
		today(api, '2026-04-20T08:00:00Z');
		vacation = await file(o.worker, 'vacation', '2026-05-04', '2026-05-08');
		await o.lead.desk.post(`/absences/${vacation}/approve`, {});

		sick = await file(o.worker, 'sick', '2026-05-06', '2026-05-07');
		expect(await days(sick)).toEqual([]);
		expect((await days(vacation)).every((day) => day.superseded_by === null)).toBe(true);
	});

	it('books the sick days back to the bucket they came from and tells the person', async () => {
		const answer = await o.hr.desk.post(`/absences/${sick}/confirm-sick-note`, {});

		expect(answer.status).toBe(200);
		expectContract(absenceSchema, answer.body);
		expect(answer.body).toMatchObject({
			status: 'approved',
			targetMinutes: 960,
			sickNote: { confirmedBy: { id: o.hr.userId, displayName: 'Hanna Personal' } }
		});
		expect(await days(sick)).toEqual([
			{ date: '2026-05-06', superseded_by: null },
			{ date: '2026-05-07', superseded_by: null }
		]);
		expect((await days(vacation)).map((day) => day.superseded_by)).toEqual([
			null,
			null,
			sick,
			sick,
			null
		]);
		expect(await ledger(api, o.worker)).toEqual([
			expect.objectContaining({ bucket_year: 2026, entry_type: 'taken', days: '-5.00' }),
			{
				bucket_year: 2026,
				entry_type: 'refund_sick',
				days: '2.00',
				effective_date: '2026-04-20',
				absence_id: vacation
			}
		]);

		const listed = await o.worker.desk.get('/absences?from=2026-05-01&to=2026-05-31&type=vacation');
		expect(listed.body.items[0]).toMatchObject({ id: vacation, vacationDays: '3.00' });

		await vi.waitFor(() =>
			expect(
				api.mails.find((mail) => mail.subject === 'Urlaub nach Attest zurückgebucht')
			).toBeTruthy()
		);
		const mail = api.mails.find((mail) => mail.subject === 'Urlaub nach Attest zurückgebucht')!;
		expect(mail.text).toContain('2 Urlaubstage');
		expect(mail.text).toContain('06.05.2026, 07.05.2026');
	});

	it('confirms a certificate only once', async () => {
		const answer = await o.hr.desk.post(`/absences/${sick}/confirm-sick-note`, {});
		expect(answer.status).toBe(409);
		expect(await ledger(api, o.worker)).toHaveLength(2);
	});

	it('replays the carry-over split of the approval day, not the one of today', async () => {
		today(api, '2026-03-20T08:00:00Z');
		const split = await file(o.colleague, 'vacation', '2026-03-26', '2026-04-01');
		await o.lead.desk.post(`/absences/${split}/approve`, {});
		expect(await ledger(api, o.colleague)).toEqual([
			expect.objectContaining({ bucket_year: 2025, entry_type: 'taken', days: '-3.00' }),
			expect.objectContaining({ bucket_year: 2026, entry_type: 'taken', days: '-2.00' })
		]);

		// by now the 2025 bucket counts as kept, today it would be drawn on last
		today(api, '2026-04-10T08:00:00Z');
		const ill = await file(o.colleague, 'sick', '2026-03-30', '2026-03-31');
		await o.hr.desk.post(`/absences/${ill}/confirm-sick-note`, {});

		expect((await ledger(api, o.colleague)).slice(2)).toEqual([
			expect.objectContaining({ bucket_year: 2025, entry_type: 'refund_sick', days: '1.00' }),
			expect.objectContaining({ bucket_year: 2026, entry_type: 'refund_sick', days: '1.00' })
		]);
	});

	it('confirms a sick note without vacation under it and books nothing', async () => {
		const ill = await file(o.colleague, 'sick', '2026-06-08', '2026-06-09');
		const answer = await o.hr.desk.post(`/absences/${ill}/confirm-sick-note`, {});
		expect(answer.status).toBe(200);
		expect(answer.body.targetMinutes).toBe(960);
		expect(await days(ill)).toHaveLength(2);
		expect(await ledger(api, o.colleague)).toHaveLength(4);
	});

	it('is for hr only, never on the own sick note and never on vacation', async () => {
		const own = await file(o.hr, 'sick', '2026-06-15', '2026-06-15');
		const answer = await o.hr.desk.post(`/absences/${own}/confirm-sick-note`, {});
		expect(answer.status).toBe(403);
		expect(answer.body.message).toBe('Nobody decides on their own absence');

		const ill = await file(o.worker, 'sick', '2026-06-22', '2026-06-22');
		expect((await o.lead.desk.post(`/absences/${ill}/confirm-sick-note`, {})).status).toBe(403);
		expect((await o.hr.desk.post(`/absences/${vacation}/confirm-sick-note`, {})).status).toBe(409);
		expect(
			(await o.hr.desk.post(`/absences/${ill}/confirm-sick-note`, { note: 'mehr' })).status
		).toBe(400);

		const elsewhere = await office(api);
		expect((await elsewhere.hr.desk.post(`/absences/${ill}/confirm-sick-note`, {})).status).toBe(
			404
		);
	});

	it('keeps a confirmed sick note from being cancelled', async () => {
		const answer = await o.worker.desk.post(`/absences/${sick}/cancel`, {});
		expect(answer.status).toBe(409);
	});

	it('books a double click on the confirmation back only once', async () => {
		const trip = await file(o.worker, 'vacation', '2026-07-13', '2026-07-17');
		await o.lead.desk.post(`/absences/${trip}/approve`, {});
		const ill = await file(o.worker, 'sick', '2026-07-15', '2026-07-15');

		const clicks = await Promise.all([
			o.hr.desk.post(`/absences/${ill}/confirm-sick-note`, {}),
			o.hr.desk.post(`/absences/${ill}/confirm-sick-note`, {})
		]);

		expect(clicks.map((click) => click.status).sort()).toEqual([200, 409]);
		expect(
			(await ledger(api, o.worker)).filter(
				(row) => row.absence_id === trip && row.entry_type === 'refund_sick'
			)
		).toEqual([expect.objectContaining({ days: '1.00' })]);
	});
});
