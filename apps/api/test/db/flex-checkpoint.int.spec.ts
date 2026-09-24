import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
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

const figures = {
	targetMinutes: 9600,
	workedMinutes: 9900,
	creditedMinutes: 0,
	diffMinutes: 300,
	vacationDays: '0.00',
	sickDays: '2.00',
	openFindings: 0
};

const hidden = { code: '42501' };

beforeAll(async () => {
	app = await connectAs('app');
	tenant = await createTenant();
	const team = await createTeam(tenant);
	lead = await createPerson(tenant, { role: 'team_lead', teamId: team, leads: team });
	worker = await createPerson(tenant, { teamId: team });
	colleague = await createPerson(tenant, { teamId: team });
	hr = await createUser(tenant, { role: 'hr' });
	admin = await createUser(tenant, { role: 'admin' });

	await closeDecember({ [worker.employeeId]: 300, [lead.employeeId]: -45 });
});

async function closeDecember(balances: Record<string, number>) {
	const employees = Object.fromEntries(
		Object.entries(balances).map(([id, minutes]) => [
			id,
			{ ...figures, flexBalanceMinutes: minutes }
		])
	);
	await withContext(app, hr.context);
	await app.query(
		`insert into app.month_closings (tenant_id, month, action, snapshot, created_by)
		 values ($1, '2025-12-01', 'close', $2, $3)`,
		[tenant, { ruleVersions: ['arbzg-1994'], employees }, hr.userId]
	);
}

async function checkpoint(reader: Account, employeeId: string, year = 2026) {
	await withContext(app, reader.context);
	const { rows } = await app.query<{ minutes: number | null }>(
		'select app.flex_checkpoint($1, $2) as minutes',
		[employeeId, year]
	);
	return rows[0]!.minutes;
}

describe('app.flex_checkpoint', () => {
	it('gives people the balance they ended december with', async () => {
		expect(await checkpoint(worker, worker.employeeId)).toBe(300);
		expect(await checkpoint(lead, lead.employeeId)).toBe(-45);
	});

	it('gives the lead the balances of the team', async () => {
		expect(await checkpoint(lead, worker.employeeId)).toBe(300);
	});

	it('refuses the balance of anyone else', async () => {
		await expect(checkpoint(colleague, worker.employeeId)).rejects.toMatchObject(hidden);
		await expect(checkpoint(worker, lead.employeeId)).rejects.toMatchObject(hidden);

		const unlinked = await createUser(tenant, { role: 'employee' });
		await expect(checkpoint(unlinked, worker.employeeId)).rejects.toMatchObject(hidden);
	});

	it('gives hr and admins everyone', async () => {
		expect(await checkpoint(hr, worker.employeeId)).toBe(300);
		expect(await checkpoint(hr, lead.employeeId)).toBe(-45);
		expect(await checkpoint(admin, worker.employeeId)).toBe(300);
	});

	it('answers null when there is nothing to carry over', async () => {
		expect(await checkpoint(worker, worker.employeeId, 2025)).toBeNull();

		const newcomer = await createPerson(tenant, { entryDate: '2026-02-01' });
		expect(await checkpoint(newcomer, newcomer.employeeId)).toBeNull();
	});

	it('stays inside the own tenant', async () => {
		const elsewhere = await createTenant();
		const foreignHr = await createUser(elsewhere, { role: 'hr' });
		expect(await checkpoint(foreignHr, worker.employeeId)).toBeNull();
	});

	it('drops a reopened december and takes the newest close after it', async () => {
		await withContext(app, admin.context);
		await app.query(
			`insert into app.month_closings (tenant_id, month, action, reason, created_by)
			 values ($1, '2025-12-01', 'reopen', 'Überstunden aus dem Dezember nachgetragen', $2)`,
			[tenant, admin.userId]
		);
		expect(await checkpoint(worker, worker.employeeId)).toBeNull();

		await closeDecember({ [worker.employeeId]: 420 });
		expect(await checkpoint(worker, worker.employeeId)).toBe(420);
		expect(await checkpoint(hr, lead.employeeId)).toBeNull();
	});
});
