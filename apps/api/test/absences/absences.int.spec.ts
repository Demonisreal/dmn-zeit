import { absencePageSchema, absencePreviewSchema, absenceSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectContract, startApi, type Api } from '../auth/api';
import {
	closeMonth,
	grant,
	ledger,
	member,
	office,
	today,
	type Member,
	type Office
} from './office';

let api: Api;
let o: Office;
let elsewhere: Office;
let stranger: Member;

beforeAll(async () => {
	api = await startApi();
	o = await office(api);
	elsewhere = await office(api);
	stranger = await member(api, o.tenantId, 'Fritz Fremd', {
		role: 'team_lead',
		teamId: o.otherTeam,
		leads: o.otherTeam
	});
	await grant(api, o.worker, 2025, '5.00');
	await grant(api, o.worker, 2026, '30.00');
	today(api, '2026-03-10T09:00:00Z');
});

afterAll(() => api.app.close());

const easter = { type: 'vacation', startDate: '2026-03-30', endDate: '2026-04-03' };

function request(person: Member, body: object) {
	return person.desk.post('/absences', { employeeId: person.employeeId, ...body });
}

async function approved(person: Member, body: object) {
	const created = await request(person, body);
	expect(created.status).toBe(201);
	const decided = await o.lead.desk.post(`/absences/${created.body.id}/approve`, {});
	expect(decided.status).toBe(200);
	return decided.body.id as string;
}

async function activeDays(absenceId: string) {
	const { rows } = await api.superuser.query(
		'select count(*)::int as n from app.absence_days where absence_id = $1 and superseded_at is null',
		[absenceId]
	);
	return rows[0].n as number;
}

describe('POST /api/absences/preview', () => {
	it('prices the request per day and draws the carry-over first', async () => {
		const answer = await o.worker.desk.post('/absences/preview', {
			employeeId: o.worker.employeeId,
			...easter
		});

		expect(answer.status).toBe(200);
		expectContract(absencePreviewSchema, answer.body);
		expect(answer.body).toMatchObject({
			vacationDays: '4.00',
			targetMinutes: 1920,
			allocations: [
				{ bucketYear: 2025, days: '2.00' },
				{ bucketYear: 2026, days: '2.00' }
			],
			remainingAfter: '31.00',
			overlapsWith: []
		});
		expect(answer.body.days.at(-1)).toEqual({
			date: '2026-04-03',
			portion: 0,
			targetMinutes: 0,
			vacationDays: '0.00',
			explanation: { key: 'vacation.day.holiday', params: { code: 'good_friday' } }
		});
	});

	it('costs no leave for time off in lieu', async () => {
		const answer = await o.worker.desk.post('/absences/preview', {
			employeeId: o.worker.employeeId,
			...easter,
			type: 'time_off'
		});
		expect(answer.body).toMatchObject({
			vacationDays: '0.00',
			targetMinutes: 1920,
			allocations: [],
			remainingAfter: null
		});
	});

	it('lets the lead look at a member but not a colleague at another', async () => {
		const body = { employeeId: o.worker.employeeId, ...easter };
		expect((await o.lead.desk.post('/absences/preview', body)).status).toBe(200);
		const foreign = await o.colleague.desk.post('/absences/preview', body);
		expect(foreign.status).toBe(403);
		expect(foreign.body.code).toBe('FORBIDDEN');
	});

	it('refuses an end before the start and a range over a year', async () => {
		const backwards = await o.worker.desk.post('/absences/preview', {
			employeeId: o.worker.employeeId,
			type: 'vacation',
			startDate: '2026-04-03',
			endDate: '2026-03-30'
		});
		expect(backwards.status).toBe(400);
		expect(backwards.body.details[0]).toMatchObject({ message: 'absence.endBeforeStart' });

		const endless = await o.worker.desk.post('/absences/preview', {
			employeeId: o.worker.employeeId,
			type: 'sick',
			startDate: '2026-01-01',
			endDate: '2027-06-30'
		});
		expect(endless.status).toBe(400);
		expect(endless.body.details[0]).toMatchObject({
			field: 'endDate',
			message: 'range.tooLong',
			params: { max: 366 }
		});
	});
});

describe('POST /api/absences and the decisions on it', () => {
	let easterId: string;

	it('files the request as pending and books nothing yet', async () => {
		const answer = await request(o.worker, easter);

		expect(answer.status).toBe(201);
		expectContract(absenceSchema, answer.body);
		expect(answer.body).toMatchObject({
			employee: { id: o.worker.employeeId, name: 'Wim Werner' },
			status: 'pending',
			vacationDays: '4.00',
			targetMinutes: 1920,
			requestedBy: { id: o.worker.userId, displayName: 'Wim Werner' },
			decidedBy: null,
			sickNote: null
		});
		expect(await activeDays(answer.body.id)).toBe(4);
		expect(await ledger(api, o.worker)).toEqual([]);
		easterId = answer.body.id;
	});

	it('files nothing for a colleague or for somebody of another tenant', async () => {
		const body = {
			employeeId: o.worker.employeeId,
			type: 'vacation',
			startDate: '2026-11-02',
			endDate: '2026-11-03'
		};
		expect((await o.colleague.desk.post('/absences', body)).status).toBe(403);
		expect((await stranger.desk.post('/absences', body)).status).toBe(403);
		expect((await elsewhere.hr.desk.post('/absences', body)).status).toBe(404);
	});

	it('refuses a second request over the same days', async () => {
		const answer = await request(o.worker, { ...easter, type: 'time_off' });
		expect(answer.status).toBe(409);
		expect(answer.body.code).toBe('TIME_OVERLAP');
	});

	it('shows the open request in the preview of a new one', async () => {
		const answer = await o.worker.desk.post('/absences/preview', {
			employeeId: o.worker.employeeId,
			...easter,
			type: 'sick'
		});
		expect(answer.body.overlapsWith).toEqual([easterId]);
	});

	it('lets nobody but the lead or hr decide', async () => {
		const asWorker = await o.worker.desk.post(`/absences/${easterId}/approve`, {});
		expect(asWorker.status).toBe(403);
		const asColleague = await o.colleague.desk.post(`/absences/${easterId}/reject`, {
			note: 'Nein'
		});
		expect(asColleague.status).toBe(403);

		// rls hides the request from the lead of another team before any check could refuse it
		expect((await stranger.desk.post(`/absences/${easterId}/approve`, {})).status).toBe(404);
		expect(
			(await stranger.desk.post(`/absences/${easterId}/reject`, { note: 'Nein' })).status
		).toBe(404);
	});

	it('books the approval against the buckets, carry-over first', async () => {
		const answer = await o.lead.desk.post(`/absences/${easterId}/approve`, { note: 'Gute Reise' });

		expect(answer.status).toBe(200);
		expectContract(absenceSchema, answer.body);
		expect(answer.body).toMatchObject({
			status: 'approved',
			decidedBy: { id: o.lead.userId, displayName: 'Lena Leitung' },
			decisionNote: 'Gute Reise'
		});
		expect(await ledger(api, o.worker)).toEqual([
			{
				bucket_year: 2025,
				entry_type: 'taken',
				days: '-2.00',
				effective_date: '2026-03-10',
				absence_id: easterId
			},
			{
				bucket_year: 2026,
				entry_type: 'taken',
				days: '-2.00',
				effective_date: '2026-03-10',
				absence_id: easterId
			}
		]);
	});

	it('does not approve twice', async () => {
		const answer = await o.hr.desk.post(`/absences/${easterId}/approve`, {});
		expect(answer.status).toBe(409);
		expect(answer.body.code).toBe('INVALID_STATE');
		expect(await ledger(api, o.worker)).toHaveLength(2);
	});

	it('cancels only after a second person agreed, then books every bucket back', async () => {
		expect((await o.lead.desk.post(`/absences/${easterId}/cancel`, {})).status).toBe(403);
		expect((await o.colleague.desk.post(`/absences/${easterId}/cancel`, {})).status).toBe(404);

		const asked = await o.worker.desk.post(`/absences/${easterId}/cancel`, {
			note: 'Reise fällt aus'
		});
		expect(asked.status).toBe(200);
		expectContract(absenceSchema, asked.body);
		expect(asked.body).toMatchObject({ status: 'cancel_pending', decisionNote: 'Reise fällt aus' });
		expect(await activeDays(easterId)).toBe(4);
		expect((await o.worker.desk.post(`/absences/${easterId}/cancel`, {})).status).toBe(409);

		const done = await o.lead.desk.post(`/absences/${easterId}/approve`, {});
		expect(done.status).toBe(200);
		expect(done.body.status).toBe('cancelled');
		expect(await activeDays(easterId)).toBe(0);
		expect((await ledger(api, o.worker)).slice(2)).toEqual([
			expect.objectContaining({ bucket_year: 2025, entry_type: 'refund_cancel', days: '2.00' }),
			expect.objectContaining({ bucket_year: 2026, entry_type: 'refund_cancel', days: '2.00' })
		]);

		// the days are free again
		const again = await request(o.worker, easter);
		expect(again.status).toBe(201);
		await o.worker.desk.post(`/absences/${again.body.id}/withdraw`, {});
	});

	it('keeps an approval standing when the lead turns the cancellation down', async () => {
		const id = await approved(o.worker, {
			type: 'vacation',
			startDate: '2026-08-03',
			endDate: '2026-08-04'
		});
		await o.worker.desk.post(`/absences/${id}/cancel`, {});
		const answer = await o.lead.desk.post(`/absences/${id}/reject`, { note: 'Bleibt so' });

		expect(answer.status).toBe(200);
		expect(answer.body.status).toBe('approved');
		expect(await activeDays(id)).toBe(2);
		expect((await ledger(api, o.worker)).filter((row) => row.absence_id === id)).toEqual([
			expect.objectContaining({ entry_type: 'taken', days: '-2.00' })
		]);
	});

	it('rejects with a reason and frees the days', async () => {
		const created = await request(o.worker, {
			type: 'time_off',
			startDate: '2026-05-11',
			endDate: '2026-05-12'
		});
		const bare = await o.lead.desk.post(`/absences/${created.body.id}/reject`, {});
		expect(bare.status).toBe(400);

		const answer = await o.lead.desk.post(`/absences/${created.body.id}/reject`, {
			note: 'Quartalsabschluss'
		});
		expectContract(absenceSchema, answer.body);
		expect(answer.body).toMatchObject({ status: 'rejected', decisionNote: 'Quartalsabschluss' });
		expect(await activeDays(created.body.id)).toBe(0);

		const again = await request(o.worker, {
			type: 'time_off',
			startDate: '2026-05-12',
			endDate: '2026-05-12'
		});
		expect(again.status).toBe(201);
		await o.worker.desk.post(`/absences/${again.body.id}/withdraw`, {});
	});

	it('withdraws only an open request of one’s own', async () => {
		const created = await request(o.worker, {
			type: 'vacation',
			startDate: '2026-06-01',
			endDate: '2026-06-02'
		});
		expect((await o.lead.desk.post(`/absences/${created.body.id}/withdraw`, {})).status).toBe(403);
		expect((await o.colleague.desk.post(`/absences/${created.body.id}/withdraw`, {})).status).toBe(
			404
		);

		const answer = await o.worker.desk.post(`/absences/${created.body.id}/withdraw`, {});
		expect(answer.status).toBe(200);
		expectContract(absenceSchema, answer.body);
		expect(answer.body.status).toBe('withdrawn');
		expect(await activeDays(created.body.id)).toBe(0);
		expect((await o.worker.desk.post(`/absences/${created.body.id}/withdraw`, {})).status).toBe(
			409
		);
	});

	it('never lets a lead decide on their own leave', async () => {
		const created = await request(o.lead, {
			type: 'vacation',
			startDate: '2026-07-06',
			endDate: '2026-07-07'
		});
		const own = await o.lead.desk.post(`/absences/${created.body.id}/approve`, {});
		expect(own.status).toBe(403);
		expect(own.body).toEqual({
			code: 'FORBIDDEN',
			message: 'Nobody decides on their own absence',
			details: null
		});
		expect((await o.hr.desk.post(`/absences/${created.body.id}/approve`, {})).status).toBe(200);
	});

	it('takes a sick note as approved without anybody deciding', async () => {
		const answer = await request(o.colleague, {
			type: 'sick',
			startDate: '2026-09-07',
			endDate: '2026-09-08'
		});
		expect(answer.status).toBe(201);
		expect(answer.body).toMatchObject({
			status: 'approved',
			decidedBy: null,
			vacationDays: '0.00',
			targetMinutes: 960
		});
	});

	it('books a double click on approve only once', async () => {
		const created = await request(o.worker, {
			type: 'vacation',
			startDate: '2026-09-14',
			endDate: '2026-09-15'
		});
		const clicks = await Promise.all([
			o.lead.desk.post(`/absences/${created.body.id}/approve`, {}),
			o.lead.desk.post(`/absences/${created.body.id}/approve`, {})
		]);

		expect(clicks.map((click) => click.status).sort()).toEqual([200, 409]);
		expect(
			(await ledger(api, o.worker)).filter((row) => row.absence_id === created.body.id)
		).toEqual([expect.objectContaining({ entry_type: 'taken', days: '-2.00' })]);
	});

	it('hides the request from another tenant', async () => {
		const answer = await elsewhere.lead.desk.post(`/absences/${easterId}/approve`, {});
		expect(answer.status).toBe(404);
		expect((await elsewhere.hr.desk.post(`/absences/${easterId}/cancel`, {})).status).toBe(404);
	});
});

describe('GET /api/absences', () => {
	const year = 'from=2026-01-01&to=2026-12-31';

	it('lists the own requests in date order and pages through them', async () => {
		const first = await o.worker.desk.get(`/absences?${year}&limit=2`);
		expect(first.status).toBe(200);
		expectContract(absencePageSchema, first.body);
		expect(first.body.items).toHaveLength(2);
		expect(first.body.nextCursor).toEqual(expect.any(String));

		const rest = await o.worker.desk.get(
			`/absences?${year}&limit=200&cursor=${first.body.nextCursor}`
		);
		const all = [...first.body.items, ...rest.body.items];
		expect(all.every((absence) => absence.employee.id === o.worker.employeeId)).toBe(true);
		const starts = all.map((absence) => absence.startDate);
		expect(starts).toEqual([...starts].sort());
		expect(rest.body.nextCursor).toBeNull();
	});

	it('gives the lead an inbox of the open requests in the team, never their own', async () => {
		const open = await request(o.colleague, {
			type: 'vacation',
			startDate: '2026-10-05',
			endDate: '2026-10-06'
		});
		await request(o.lead, { type: 'vacation', startDate: '2026-10-12', endDate: '2026-10-12' });
		await request(o.outsider, { type: 'vacation', startDate: '2026-10-05', endDate: '2026-10-05' });

		const inbox = await o.lead.desk.get(`/absences?${year}&scope=inbox`);
		expect(inbox.status).toBe(200);
		expect(inbox.body.items.map((absence: { id: string }) => absence.id)).toEqual([open.body.id]);

		const all = await o.hr.desk.get(`/absences?${year}&scope=inbox`);
		expect(
			all.body.items.map((absence: { employee: { name: string } }) => absence.employee.name)
		).toEqual(expect.arrayContaining(['Clara Kolleg', 'Lena Leitung', 'Otto Aussen']));
	});

	it('shows the whole inbox without a range, only the other lists want one', async () => {
		const early = await request(o.worker, {
			type: 'time_off',
			startDate: '2025-02-03',
			endDate: '2025-02-03'
		});
		const late = await request(o.worker, {
			type: 'time_off',
			startDate: '2029-06-04',
			endDate: '2029-06-05'
		});

		const inbox = await o.lead.desk.get('/absences?scope=inbox');
		expect(inbox.status).toBe(200);
		const ids = inbox.body.items.map((absence: { id: string }) => absence.id);
		expect(ids.at(0)).toBe(early.body.id);
		expect(ids.at(-1)).toBe(late.body.id);

		const all = await o.lead.desk.get('/absences?scope=all');
		expect(all.status).toBe(400);
		expect(all.body.details[0]).toMatchObject({ field: 'from', message: 'range.required' });
	});

	it('keeps the lead to the own team and everyone else to their own requests', async () => {
		const team = await o.lead.desk.get(`/absences?${year}&scope=all`);
		const names = team.body.items.map(
			(absence: { employee: { name: string } }) => absence.employee.name
		);
		expect(names).toContain('Clara Kolleg');
		expect(names).not.toContain('Otto Aussen');

		const colleague = await o.worker.desk.get(
			`/absences?${year}&employee=${o.colleague.employeeId}`
		);
		expect(colleague.status).toBe(200);
		expect(colleague.body.items).toEqual([]);
		const foreign = await elsewhere.hr.desk.get(
			`/absences?${year}&scope=all&employee=${o.worker.employeeId}`
		);
		expect(foreign.body.items).toEqual([]);
	});

	it('filters by status and type', async () => {
		const answer = await o.lead.desk.get(`/absences?${year}&scope=all&status=approved&type=sick`);
		expect(
			answer.body.items.map((absence: { employee: { name: string } }) => absence.employee.name)
		).toEqual(['Clara Kolleg']);
	});

	it('keeps inbox and all from employees and rejects a broken cursor', async () => {
		expect((await o.worker.desk.get(`/absences?${year}&scope=inbox`)).status).toBe(403);
		const broken = await o.worker.desk.get(`/absences?${year}&cursor=kaputt`);
		expect(broken.status).toBe(400);
		expect(broken.body.details[0]).toMatchObject({ field: 'cursor' });
	});
});

describe('closed months', () => {
	it('allows no new absence and no decision inside a closed month', async () => {
		const locked = await office(api);
		const pending = await request(locked.worker, {
			type: 'vacation',
			startDate: '2026-01-19',
			endDate: '2026-01-20'
		});
		expect(pending.status).toBe(201);
		await closeMonth(api, locked.tenantId, '2026-01-01', locked.hr.userId);

		const late = await request(locked.worker, {
			type: 'sick',
			startDate: '2026-01-26',
			endDate: '2026-01-26'
		});
		expect(late.status).toBe(409);
		expect(late.body.code).toBe('PERIOD_LOCKED');

		const decision = await locked.lead.desk.post(`/absences/${pending.body.id}/approve`, {});
		expect(decision.status).toBe(409);
		expect(decision.body.code).toBe('PERIOD_LOCKED');
	});
});
