import { teamCalendarSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectContract, startApi, type Api } from '../auth/api';
import { office, type Member, type Office } from './office';

let api: Api;
let o: Office;

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

beforeAll(async () => {
	api = await startApi();
	o = await office(api);
	const vacation = await file(o.worker, 'vacation', '2026-05-11', '2026-05-12');
	await o.lead.desk.post(`/absences/${vacation}/approve`, {});
	await file(o.colleague, 'sick', '2026-05-13', '2026-05-13');
	await file(o.outsider, 'vacation', '2026-05-11', '2026-05-11');
	// withdrawn requests leave no trace in the calendar
	const withdrawn = await file(o.colleague, 'time_off', '2026-05-20', '2026-05-20');
	await o.colleague.desk.post(`/absences/${withdrawn}/withdraw`, {});
});

afterAll(() => api.app.close());

describe('GET /api/team-calendar', () => {
	it('tells employees that a colleague is away, not why', async () => {
		const answer = await o.worker.desk.get('/team-calendar?month=2026-05');

		expect(answer.status).toBe(200);
		expectContract(teamCalendarSchema, answer.body);
		expect(answer.body).toEqual({
			month: '2026-05',
			holidays: [
				{ date: '2026-05-01', code: 'labour_day', portion: 1 },
				{ date: '2026-05-14', code: 'ascension_day', portion: 1 },
				{ date: '2026-05-25', code: 'whit_monday', portion: 1 }
			],
			people: [
				{
					employee: { id: o.colleague.employeeId, name: 'Clara Kolleg' },
					days: [{ date: '2026-05-13', portion: 1, type: 'absent', status: null }]
				},
				{
					employee: { id: o.worker.employeeId, name: 'Wim Werner' },
					days: [
						{ date: '2026-05-11', portion: 1, type: 'absent', status: null },
						{ date: '2026-05-12', portion: 1, type: 'absent', status: null }
					]
				}
			]
		});
	});

	it('shows the lead type and status, for the team they lead without asking', async () => {
		const answer = await o.lead.desk.get('/team-calendar?month=2026-05');

		expect(answer.status).toBe(200);
		expect(answer.body.people.flatMap((person: { days: unknown[] }) => person.days)).toEqual([
			{ date: '2026-05-13', portion: 1, type: 'sick', status: 'approved' },
			{ date: '2026-05-11', portion: 1, type: 'vacation', status: 'approved' },
			{ date: '2026-05-12', portion: 1, type: 'vacation', status: 'approved' }
		]);
	});

	it('gives hr the full view of any team it names', async () => {
		const answer = await o.hr.desk.get(`/team-calendar?month=2026-05&team=${o.otherTeam}`);
		expect(answer.body.people).toEqual([
			{
				employee: { id: o.outsider.employeeId, name: 'Otto Aussen' },
				days: [{ date: '2026-05-11', portion: 1, type: 'vacation', status: 'pending' }]
			}
		]);
	});

	it('needs a team from someone who belongs to none', async () => {
		const answer = await o.hr.desk.get('/team-calendar?month=2026-05');
		expect(answer.status).toBe(400);
		expect(answer.body.details[0]).toMatchObject({ field: 'team' });
	});

	it('keeps other teams closed to employees and checks the month', async () => {
		const foreign = await o.outsider.desk.get(`/team-calendar?month=2026-05&team=${o.team}`);
		expect(foreign.status).toBe(403);
		expect((await o.worker.desk.get('/team-calendar?month=2026-13')).status).toBe(400);
	});

	it('names no team of another tenant', async () => {
		const elsewhere = await office(api);
		const answer = await elsewhere.hr.desk.get(`/team-calendar?month=2026-05&team=${o.team}`);
		expect(answer.status).toBe(403);
	});
});
