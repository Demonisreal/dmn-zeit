import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SnapshotRow } from '../../src/months/snapshot';
import {
	connectAs,
	createPerson,
	createTeam,
	createTenant,
	createUser,
	type Account,
	type Person,
	withContext
} from '../helpers/pg';

let app: pg.Client;
let tenant: string;
let hr: Account;
let admin: Account;
let lead: Person;
let worker: Person;
let colleague: Person;
let otherLead: Person;

const workerJanuary: SnapshotRow = {
	targetMinutes: 9600,
	workedMinutes: 9900,
	creditedMinutes: 0,
	diffMinutes: 300,
	flexBalanceMinutes: 300,
	vacationDays: '0.00',
	sickDays: '2.00',
	openFindings: 1
};

const colleagueJanuary: SnapshotRow = {
	targetMinutes: 4800,
	workedMinutes: 4380,
	creditedMinutes: 480,
	diffMinutes: 60,
	flexBalanceMinutes: -120,
	vacationDays: '1.00',
	sickDays: '0.00',
	openFindings: 0
};

const hidden = { code: '42501' };

beforeAll(async () => {
	app = await connectAs('app');
	tenant = await createTenant();
	const team = await createTeam(tenant);
	const otherTeam = await createTeam(tenant, 'Lohn');
	lead = await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team });
	worker = await createPerson(tenant, { teamId: team });
	colleague = await createPerson(tenant, { teamId: team });
	otherLead = await createPerson(tenant, {
		role: 'team_lead',
		teamId: otherTeam,
		leads: otherTeam
	});
	hr = await createUser(tenant, { role: 'hr' });
	admin = await createUser(tenant, { role: 'admin' });

	await closeJanuary({
		[worker.employeeId]: workerJanuary,
		[colleague.employeeId]: colleagueJanuary
	});
});

async function closeJanuary(employees: Record<string, SnapshotRow>) {
	await withContext(app, hr.context);
	await app.query(
		`insert into app.month_closings (tenant_id, month, action, snapshot, created_by)
		 values ($1, '2026-01-01', 'close', $2, $3)`,
		[tenant, { ruleVersions: ['arbzg-1994'], employees }, hr.userId]
	);
}

async function snapshot(reader: Account, employeeId: string, month = '2026-01-01') {
	await withContext(app, reader.context);
	const { rows } = await app.query<{ figures: SnapshotRow | null }>(
		'select app.month_snapshot($1, $2) as figures',
		[employeeId, month]
	);
	return rows[0]!.figures;
}

describe('app.month_snapshot', () => {
	it('gives people their own row of a closed month', async () => {
		expect(await snapshot(worker, worker.employeeId)).toStrictEqual(workerJanuary);
		expect(await snapshot(colleague, colleague.employeeId)).toStrictEqual(colleagueJanuary);
	});

	it('gives the lead the rows of the team', async () => {
		expect(await snapshot(lead, worker.employeeId)).toStrictEqual(workerJanuary);
		expect(await snapshot(lead, colleague.employeeId)).toStrictEqual(colleagueJanuary);
	});

	it('refuses the row of anyone else', async () => {
		await expect(snapshot(colleague, worker.employeeId)).rejects.toMatchObject(hidden);
		await expect(snapshot(worker, colleague.employeeId)).rejects.toMatchObject(hidden);
		await expect(snapshot(otherLead, worker.employeeId)).rejects.toMatchObject(hidden);

		const unlinked = await createUser(tenant, { role: 'employee' });
		await expect(snapshot(unlinked, worker.employeeId)).rejects.toMatchObject(hidden);
	});

	it('gives hr and admins everyone', async () => {
		expect(await snapshot(hr, worker.employeeId)).toStrictEqual(workerJanuary);
		expect(await snapshot(hr, colleague.employeeId)).toStrictEqual(colleagueJanuary);
		expect(await snapshot(admin, worker.employeeId)).toStrictEqual(workerJanuary);
	});

	it('hands out the one row and nothing of the others', async () => {
		const figures = await snapshot(hr, worker.employeeId);
		expect(Object.keys(figures!).sort()).toEqual(Object.keys(workerJanuary).sort());
		expect(JSON.stringify(figures)).not.toContain(colleague.employeeId);
		expect(JSON.stringify(figures)).not.toContain(worker.employeeId);
	});

	it('takes any day of the month', async () => {
		expect(await snapshot(worker, worker.employeeId, '2026-01-15')).toStrictEqual(workerJanuary);
	});

	it('answers null when the month holds nothing for the person', async () => {
		expect(await snapshot(worker, worker.employeeId, '2026-02-01')).toBeNull();
		expect(await snapshot(worker, worker.employeeId, '2025-12-01')).toBeNull();
		expect(await snapshot(lead, lead.employeeId)).toBeNull();
	});

	it('stays inside the own tenant', async () => {
		const elsewhere = await createTenant();
		const foreignHr = await createUser(elsewhere, { role: 'hr' });
		expect(await snapshot(foreignHr, worker.employeeId)).toBeNull();
	});

	it('drops a reopened month and takes the newest close after it', async () => {
		await withContext(app, admin.context);
		await app.query(
			`insert into app.month_closings (tenant_id, month, action, reason, created_by)
			 values ($1, '2026-01-01', 'reopen', 'Krankmeldung vom Januar kam zu spät', $2)`,
			[tenant, admin.userId]
		);
		expect(await snapshot(worker, worker.employeeId)).toBeNull();
		expect(await snapshot(hr, colleague.employeeId)).toBeNull();

		const corrected = { ...workerJanuary, sickDays: '3.00', flexBalanceMinutes: 420 };
		await closeJanuary({ [worker.employeeId]: corrected });
		expect(await snapshot(worker, worker.employeeId)).toStrictEqual(corrected);
		expect(await snapshot(hr, colleague.employeeId)).toBeNull();
	});
});
