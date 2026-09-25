import { resolveRate, roundDiv, roundMinutes, type Rate } from '@zeit/rules';
import { projectWeekSchema, type ProjectWeek } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectContract, startApi, type Api } from '../auth/api';
import { signedIn } from '../helpers/desk';
import { createPerson, createTeam, createTenant, insertId, type Person } from '../helpers/pg';
import { addEntry } from '../time/people';
import { createClient, createProject } from './books';

let api: Api;
let tenant: string;
let team: string;
let client: string;
let project: string;
let worker: Person;

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	team = await createTeam(tenant);
	client = await createClient(api.superuser, tenant);
	project = await createProject(api.superuser, tenant, client);
	await api.superuser.query(
		`insert into app.rates (tenant_id, client_id, valid_from, rate_cents) values ($1, $2, '2026-01-01', 9000)`,
		[tenant, client]
	);
	worker = await createPerson(tenant, { teamId: team });
	const desk = await signedIn(api, worker.userId);
	await desk.post('/project-entries', {
		projectId: project,
		startedAt: '2026-09-22T09:00:00+02:00',
		endedAt: '2026-09-22T11:00:00+02:00',
		note: 'Startseite'
	});
	await addEntry(api, worker, '2026-09-22T08:30:00+02:00', '2026-09-22T12:00:00+02:00');
});

afterAll(() => api.app.close());

const amountsOf = (week: {
	rows: { cells: { amountCents: string | null }[]; rowTotal: { amountCents: string | null } }[];
	weekTotal: { amountCents: string | null };
}) => [
	...week.rows.flatMap((row) => [
		row.rowTotal.amountCents,
		...row.cells.map((cell) => cell.amountCents)
	]),
	week.weekTotal.amountCents
];

describe('project week', () => {
	it('prices the week for hr and compares it with the stamped time', async () => {
		const hr = await createPerson(tenant, { role: 'hr' });
		const desk = await signedIn(api, hr.userId);

		const answer = await desk.get(`/employees/${worker.employeeId}/project-week?from=2026-09-24`);
		expect(answer.status).toBe(200);
		expectContract(projectWeekSchema, answer.body);
		expect(answer.body.from).toBe('2026-09-21');
		expect(answer.body.weekTotal).toEqual({
			rawMinutes: 120,
			roundedMinutes: 120,
			amountCents: '18000'
		});
		expect(answer.body.coverage[1]).toMatchObject({
			date: '2026-09-22',
			projectMinutes: 120,
			workedMinutes: 210,
			unassignedMinutes: 90,
			hints: []
		});
	});

	it('shows the person and the lead minutes but not a single amount', async () => {
		const lead = await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team });
		for (const userId of [worker.userId, lead.userId]) {
			const desk = await signedIn(api, userId);
			const answer = await desk.get(`/employees/${worker.employeeId}/project-week?from=2026-09-21`);
			expect(answer.status).toBe(200);
			expectContract(projectWeekSchema, answer.body);
			expect(answer.body.weekTotal.rawMinutes).toBe(120);
			expect(amountsOf(answer.body).every((cents) => cents === null)).toBe(true);
			expect(answer.body.rows[0].cells[0].derivation.rate).toBeNull();
			expect(answer.body.unbilled).toEqual([]);
			// day totals and derivations included: no priced field anywhere in the answer
			expect(JSON.stringify(answer.body)).not.toMatch(/"(amountCents|cents|rateCents)":"/);
		}
	});

	it('rounds and flags by the project for readers below hr too', async () => {
		const meetings = await createProject(api.superuser, tenant, client, { name: 'Intern' });
		await api.superuser.query(
			`update app.projects set billable = false, rounding_increment_min = 15, rounding_mode = 'up'
			  where id = $1`,
			[meetings]
		);
		const person = await createPerson(tenant);
		const desk = await signedIn(api, person.userId);
		await desk.post('/project-entries', {
			projectId: meetings,
			startedAt: '2026-09-23T09:00:00+02:00',
			endedAt: '2026-09-23T09:20:00+02:00',
			note: 'Teamrunde'
		});

		const answer = await desk.get(`/employees/${person.employeeId}/project-week?from=2026-09-21`);
		expect(answer.body.rows[0].cells[0]).toMatchObject({
			rawMinutes: 20,
			roundedMinutes: 30,
			billable: false,
			amountCents: null
		});
	});

	it('prices each cell the way the rules round and pick the rate', async () => {
		const printer = await createClient(api.superuser, tenant, 'Druckerei Blatt');
		await api.superuser.query(
			`update app.clients set rounding_increment_min = 15, rounding_mode = 'up' where id = $1`,
			[printer]
		);
		const flyer = await createProject(api.superuser, tenant, printer, { name: 'Flyer' });
		const typesetting = await insertId(
			api.superuser,
			`insert into app.tasks (tenant_id, client_id, project_id, name)
			 values ($1, $2, $3, 'Satz') returning id`,
			[tenant, printer, flyer]
		);
		const person = await createPerson(tenant);

		// the project rate starts on wednesday, the task rate is personal
		const rates: Rate[] = [];
		for (const [validFrom, cents, projectId, taskId, employeeId] of [
			['2026-01-01', 9000n, null, null, null],
			['2026-09-23', 12345n, flyer, null, null],
			['2026-01-01', 15000n, flyer, typesetting, person.employeeId]
		] as const) {
			const id = await insertId(
				api.superuser,
				`insert into app.rates (tenant_id, client_id, project_id, task_id, employee_id, valid_from, rate_cents)
				 values ($1, $2, $3, $4, $5, $6, $7) returning id`,
				[tenant, printer, projectId, taskId, employeeId, validFrom, String(cents)]
			);
			rates.push({
				id,
				clientId: printer,
				projectId,
				taskId,
				employeeId,
				validFrom: Temporal.PlainDate.from(validFrom),
				cents
			});
		}

		const desk = await signedIn(api, person.userId);
		const book = async (startedAt: string, endedAt: string, taskId?: string) => {
			const answer = await desk.post('/project-entries', {
				projectId: flyer,
				taskId,
				startedAt,
				endedAt,
				note: 'Druckvorstufe'
			});
			expect(answer.status).toBe(201);
		};
		await book('2026-09-21T09:00:00+02:00', '2026-09-21T09:47:00+02:00');
		await book('2026-09-23T09:00:00+02:00', '2026-09-23T09:20:00+02:00');
		await book('2026-09-23T13:00:00+02:00', '2026-09-23T13:13:00+02:00');
		await book('2026-09-24T10:00:00+02:00', '2026-09-24T10:52:00+02:00', typesetting);

		const hr = await createPerson(tenant, { role: 'hr' });
		const answer = await (
			await signedIn(api, hr.userId)
		).get(`/employees/${person.employeeId}/project-week?from=2026-09-21`);
		expect(answer.status).toBe(200);
		const week: ProjectWeek = answer.body;

		const expected = (date: string, rawMinutes: number, taskId: string | null) => {
			const rounded = roundMinutes(rawMinutes, { increment: 15, mode: 'up' });
			const rate = resolveRate(rates, {
				clientId: printer,
				projectId: flyer,
				taskId,
				employeeId: person.employeeId,
				date: Temporal.PlainDate.from(date)
			})!;
			return {
				date,
				rawMinutes,
				roundedMinutes: rounded.minutes,
				billable: true,
				lock: 'none',
				amountCents: String(roundDiv(BigInt(rounded.minutes) * rate.cents, 60n)),
				derivation: expect.objectContaining({
					rounding: rounded.explanation,
					rate: { cents: String(rate.cents), explanation: rate.explanation }
				})
			};
		};
		expect(week.rows.map((row) => row.cells)).toEqual([
			[expected('2026-09-21', 47, null), expected('2026-09-23', 33, null)],
			[expected('2026-09-24', 52, typesetting)]
		]);

		// written out: 60 min at 90.00, 45 min at 123.45 = 92.5875, 60 min at 150.00
		const cells = week.rows.flatMap((row) => row.cells);
		expect(cells.map((cell) => [cell.derivation.rate?.explanation.key, cell.amountCents])).toEqual([
			['billing.rate.client', '9000'],
			['billing.rate.project', '9259'],
			['billing.rate.task_employee', '15000']
		]);
		expect(week.weekTotal).toEqual({
			rawMinutes: 132,
			roundedMinutes: 165,
			amountCents: '33259'
		});
	});

	it('flags project time beyond and outside the stamped time, in the week and the team view', async () => {
		const crew = await createTeam(tenant, 'Vertrieb');
		const person = await createPerson(tenant, { teamId: crew });
		const lead = await createPerson(tenant, { role: 'team_lead', teamId: crew, leads: crew });
		await (
			await signedIn(api, person.userId)
		).post('/project-entries', {
			projectId: project,
			startedAt: '2026-09-24T09:00:00+02:00',
			endedAt: '2026-09-24T12:00:00+02:00',
			note: 'Umzug der Seite'
		});
		await addEntry(api, person, '2026-09-24T08:00:00+02:00', '2026-09-24T10:00:00+02:00');
		const thursday = {
			date: '2026-09-24',
			projectMinutes: 180,
			workedMinutes: 120,
			coveredMinutes: 60,
			outsideMinutes: 120,
			unassignedMinutes: 60,
			hints: ['PROJECT_OVER_WORKED', 'PROJECT_OUTSIDE_WORK']
		};

		const desk = await signedIn(api, lead.userId);
		const week = await desk.get(`/employees/${person.employeeId}/project-week?from=2026-09-21`);
		expect(week.body.coverage[3]).toEqual(thursday);

		const summary = await desk.get(
			`/project-time/summary?team=${crew}&from=2026-09-21&to=2026-09-27`
		);
		expect(summary.body).toEqual([
			expect.objectContaining({ employeeId: person.employeeId, coverage: [thursday] })
		]);
	});

	it('keeps the week of a colleague closed', async () => {
		const colleague = await createPerson(tenant, { teamId: team });
		const desk = await signedIn(api, colleague.userId);
		const answer = await desk.get(`/employees/${worker.employeeId}/project-week?from=2026-09-21`);
		expect(answer.status).toBe(403);
	});

	it('has no coverage in a solo workspace', async () => {
		const solo = await createTenant({ workspace: 'solo' });
		const freelancer = await createPerson(solo, { role: 'admin' });
		const desk = await signedIn(api, freelancer.userId);

		const answer = await desk.get(
			`/employees/${freelancer.employeeId}/project-week?from=2026-09-21`
		);
		expect(answer.status).toBe(200);
		expect(answer.body.coverage).toBeNull();
	});
});

describe('project time summary', () => {
	it('sums minutes per person and project for the lead, without any amount', async () => {
		const lead = await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team });
		const desk = await signedIn(api, lead.userId);

		const answer = await desk.get(
			`/project-time/summary?team=${team}&from=2026-09-21&to=2026-09-27`
		);
		expect(answer.status).toBe(200);
		expect(answer.body).toEqual([
			expect.objectContaining({ employeeId: worker.employeeId, projectId: project, minutes: 120 })
		]);
		expect(JSON.stringify(answer.body)).not.toContain('amount');
	});

	it('is not there for an employee', async () => {
		const desk = await signedIn(api, worker.userId);
		expect((await desk.get('/project-time/summary?from=2026-09-21&to=2026-09-27')).status).toBe(
			403
		);
	});
});
