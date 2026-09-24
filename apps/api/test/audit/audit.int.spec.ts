import { auditPageSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import {
	createPerson,
	createTeam,
	createTenant,
	createUser,
	insertId,
	type Account,
	type Person
} from '../helpers/pg';

let api: Api;
let tenant: string;
let member: Person;
let colleague: Person;
let lead: Person;
let hrAccount: Account;
let hr: Desk;
let asMember: Desk;

const march = 'from=2026-03-01&to=2026-03-31';

type Entry = {
	subject: string | null;
	at: string;
	actor?: string | null;
	table?: string;
	row?: string | null;
	tenantId?: string;
};

function entry({ subject, at, actor = null, table = 'employees', row = subject, tenantId }: Entry) {
	return insertId(
		api.superuser,
		`insert into audit.log (tenant_id, occurred_at, actor_user_id, actor_role, source, action,
			table_name, row_id, subject_employee_id, diff)
		 values ($1, $2, $3, case when $3::uuid is not null then 'hr'::app.user_role end, 'trigger',
			'update', $4, $5, $6, '{"last_name": ["Alt", "Neu"]}')
		 returning id`,
		[tenantId ?? tenant, at, actor, table, row, subject]
	);
}

async function idsOf(desk: Desk, query: string) {
	const answer = await desk.get(`/audit?${query}`);
	expect(answer.status).toBe(200);
	return answer.body.items.map((item: { id: string }) => item.id);
}

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	const team = await createTeam(tenant);
	member = await createPerson(tenant, { teamId: team });
	colleague = await createPerson(tenant, { teamId: team });
	lead = await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team });
	hrAccount = await createUser(tenant, { role: 'hr' });
	await api.superuser.query(`update app.users set display_name = 'Petra Personal' where id = $1`, [
		hrAccount.userId
	]);
	hr = await signedIn(api, hrAccount.userId);
	asMember = await signedIn(api, member.userId);
});

afterAll(() => api.app.close());

describe('GET /api/audit', () => {
	it('shows people only what is about them, whichever employee they ask for', async () => {
		const own = await entry({ subject: member.employeeId, at: '2026-03-02T09:00:00Z' });
		const other = await entry({ subject: colleague.employeeId, at: '2026-03-02T10:00:00Z' });

		const mine = await idsOf(asMember, march);
		expect(mine).toContain(own);
		expect(mine).not.toContain(other);
		expect(await idsOf(asMember, `${march}&employee=${colleague.employeeId}`)).not.toContain(other);
		expect(await idsOf(asMember, `${march}&employee=${colleague.employeeId}`)).toContain(own);
	});

	it('holds team leads to the same, their team stays out', async () => {
		const aboutLead = await entry({ subject: lead.employeeId, at: '2026-03-03T09:00:00Z' });
		const aboutMember = await entry({ subject: member.employeeId, at: '2026-03-03T10:00:00Z' });
		const ids = await idsOf(await signedIn(api, lead.userId), march);
		expect(ids).toContain(aboutLead);
		expect(ids).not.toContain(aboutMember);
	});

	it('shows nothing to someone without an employee record', async () => {
		await entry({ subject: null, at: '2026-03-03T11:00:00Z', table: 'work_models' });
		const loner = await signedIn(api, (await createUser(tenant, { role: 'team_lead' })).userId);
		expect(await idsOf(loner, march)).toEqual([]);
	});

	it('gives hr the whole tenant with filters, never another one', async () => {
		const aboutMember = await entry({ subject: member.employeeId, at: '2026-03-04T09:00:00Z' });
		const aboutColleague = await entry({
			subject: colleague.employeeId,
			at: '2026-03-04T10:00:00Z'
		});
		const team = await entry({
			subject: null,
			at: '2026-03-04T11:00:00Z',
			table: 'teams',
			row: null
		});
		const foreign = await entry({
			subject: member.employeeId,
			at: '2026-03-04T12:00:00Z',
			tenantId: await createTenant()
		});

		const all = await idsOf(hr, march);
		expect(all).toEqual(expect.arrayContaining([aboutMember, aboutColleague, team]));
		expect(all).not.toContain(foreign);

		const filtered = await idsOf(hr, `${march}&employee=${colleague.employeeId}`);
		expect(filtered).toContain(aboutColleague);
		expect(filtered).not.toContain(aboutMember);

		expect(await idsOf(hr, `${march}&table=teams`)).toEqual([team]);
		expect(await idsOf(hr, `${march}&row=${member.employeeId}`)).not.toContain(aboutColleague);
	});

	it('names the actor of the own tenant only', async () => {
		const stranger = await createUser(await createTenant());
		const known = await entry({
			subject: member.employeeId,
			at: '2026-03-05T09:00:00Z',
			actor: hrAccount.userId
		});
		const unknown = await entry({
			subject: member.employeeId,
			at: '2026-03-05T10:00:00Z',
			actor: stranger.userId
		});

		const answer = await hr.get(`/audit?from=2026-03-05&to=2026-03-05`);
		expect(auditPageSchema.safeParse(answer.body).success).toBe(true);
		const byId = new Map(answer.body.items.map((item: { id: string }) => [item.id, item]));
		expect(byId.get(known)).toMatchObject({
			actorUserId: hrAccount.userId,
			actorName: 'Petra Personal',
			actorRole: 'hr',
			source: 'trigger',
			table: 'employees',
			changes: { last_name: ['Alt', 'Neu'] },
			context: null
		});
		expect(byId.get(unknown)).toMatchObject({ actorUserId: stranger.userId, actorName: null });
	});

	it('pages from newest to oldest without gaps or repeats', async () => {
		const person = await createPerson(tenant);
		const ids: string[] = [];
		for (const at of [
			'2026-03-10T08:00:00Z',
			'2026-03-10T08:01:00Z',
			'2026-03-10T08:01:00Z',
			'2026-03-10T08:02:00.123456Z',
			'2026-03-10T08:03:00Z'
		]) {
			ids.push(await entry({ subject: person.employeeId, at }));
		}

		const path = `/audit?${march}&employee=${person.employeeId}&limit=2`;
		const seen: string[] = [];
		let next: string | null = path;
		while (next) {
			const answer = await hr.get(next);
			expect(answer.body.items.length).toBeLessThanOrEqual(2);
			seen.push(...answer.body.items.map((item: { id: string }) => item.id));
			next = answer.body.nextCursor && `${path}&cursor=${answer.body.nextCursor}`;
		}

		expect(seen).toEqual([ids[4], ids[3], ids[2], ids[1], ids[0]]);
	});

	it('reads the range as days in Berlin', async () => {
		const person = await createPerson(tenant);
		const firstOfMarch = await entry({ subject: person.employeeId, at: '2026-02-28T23:30:00Z' });
		const lastOfFebruary = await entry({ subject: person.employeeId, at: '2026-02-28T22:30:00Z' });
		const firstOfApril = await entry({ subject: person.employeeId, at: '2026-03-31T22:30:00Z' });

		const ids = await idsOf(hr, `${march}&employee=${person.employeeId}`);
		expect(ids).toEqual([firstOfMarch]);
		expect(ids).not.toContain(lastOfFebruary);
		expect(ids).not.toContain(firstOfApril);
	});

	it('shows what the api changed', async () => {
		const person = await createPerson(tenant);
		await hr.patch(`/employees/${person.employeeId}`, { lastName: 'Neumann' });
		const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

		const answer = await hr.get(
			`/audit?from=${today}&to=${today}&table=employees&row=${person.employeeId}`
		);
		expect(answer.body.items.map((item: { action: string }) => item.action)).toEqual([
			'update',
			'insert'
		]);
		expect(answer.body.items[0]).toEqual(
			expect.objectContaining({
				actorUserId: hrAccount.userId,
				actorName: 'Petra Personal',
				subjectEmployeeId: person.employeeId,
				changes: { last_name: ['Muster', 'Neumann'] },
				context: null,
				requestId: expect.any(String)
			})
		);
	});

	it('keeps what the api recorded apart from the changes', async () => {
		const { userId, email } = await api.member({ tenantId: tenant });
		await api.browser().post('/auth/login', { email, password: 'nicht das passwort' });
		const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

		const answer = await hr.get(`/audit?from=${today}&to=${today}&table=users&row=${userId}`);
		expect(auditPageSchema.safeParse(answer.body).success).toBe(true);
		expect(answer.body.items).toEqual([
			expect.objectContaining({
				source: 'app',
				action: 'login.failed',
				changes: null,
				context: { method: 'password' }
			}),
			expect.objectContaining({
				source: 'trigger',
				action: 'insert',
				changes: expect.objectContaining({ id: [null, userId] }),
				context: null
			})
		]);
	});

	it('checks the query', async () => {
		for (const query of [
			'',
			'from=2026-03-31&to=2026-03-01',
			'from=2025-01-01&to=2026-03-01',
			`${march}&limit=0`,
			`${march}&limit=201`,
			`${march}&table=Employees;drop`,
			`${march}&cursor=bm9jaCBtYWw`
		]) {
			const answer = await hr.get(`/audit?${query}`);
			expect(answer.status, query).toBe(400);
			expect(answer.body.code).toBe('VALIDATION');
		}
	});
});
