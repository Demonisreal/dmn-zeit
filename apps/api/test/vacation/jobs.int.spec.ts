import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VacationExpiryJob } from '../../src/jobs/vacation-expiry.job';
import { VacationYearOpeningJob } from '../../src/jobs/vacation-year-opening.job';
import { grant, member, office, today, type Office } from '../absences/office';
import { startApi, type Api } from '../auth/api';

let api: Api;
let o: Office;

beforeAll(async () => {
	api = await startApi();
	o = await office(api);
});

afterAll(() => api.app.close());

async function entries(tenantId: string, type: string) {
	const { rows } = await api.superuser.query(
		`select e.last_name as name, l.bucket_year, l.days::text, l.effective_date::text,
				l.notice_id, l.dedupe_key
		   from app.vacation_ledger l join app.employees e on e.id = l.employee_id
		  where l.tenant_id = $1 and l.entry_type = $2::app.vacation_entry_type
		  order by e.last_name`,
		[tenantId, type]
	);
	return rows;
}

describe('VacationYearOpeningJob', () => {
	it('books the new entitlement for everyone employed in the year, once', async () => {
		const leaver = await member(api, o.tenantId, 'Lars Letzter');
		await api.superuser.query(`update app.employees set exit_date = '2027-03-31' where id = $1`, [
			leaver.employeeId
		]);
		const gone = await member(api, o.tenantId, 'Greta Gegangen');
		await api.superuser.query(`update app.employees set exit_date = '2026-06-30' where id = $1`, [
			gone.employeeId
		]);

		const job = api.app.get(VacationYearOpeningJob);
		expect(await job.open(o.tenantId, 2027)).toBe(6);

		const booked = await entries(o.tenantId, 'entitlement');
		expect(booked.map((row) => [row.name, row.days])).toEqual([
			['Aussen', '30.00'],
			['Kolleg', '30.00'],
			['Leitung', '30.00'],
			// three twelfths of 30 are 7.5, § 5 Abs. 2 BUrlG rounds that up
			['Letzter', '8.00'],
			['Personal', '30.00'],
			['Werner', '30.00']
		]);
		expect(booked[0]).toMatchObject({
			bucket_year: 2027,
			effective_date: '2027-01-01',
			dedupe_key: `vacation-entitlement:${o.outsider.employeeId}:2027`
		});

		// a restart after a crash finds every key taken
		expect(await job.open(o.tenantId, 2027)).toBe(0);
		expect(await entries(o.tenantId, 'entitlement')).toHaveLength(6);
	});
});

describe('VacationExpiryJob', () => {
	let tenant: Office;

	beforeAll(async () => {
		tenant = await office(api);
		await grant(api, tenant.worker, 2025, '4.00');
		await grant(api, tenant.colleague, 2025, '4.00');
		await api.superuser.query(
			`insert into app.vacation_notices
				(tenant_id, employee_id, bucket_year, remaining_days, deadline, sent_at, sent_by, channel, text_version)
			 values ($1, $2, 2025, 4, '2026-03-31', '2025-10-01 08:00+02', $3, 'email', '2026-09-24')`,
			[tenant.tenantId, tenant.worker.employeeId, tenant.hr.userId]
		);
	});

	it('lets the deadline day pass untouched', async () => {
		const job = api.app.get(VacationExpiryJob);
		expect(await job.expire(tenant.tenantId, Temporal.PlainDate.from('2026-03-31'))).toBe(0);
	});

	it('forfeits the rest of whoever got a notice, and nothing of anyone else', async () => {
		const job = api.app.get(VacationExpiryJob);
		expect(await job.expire(tenant.tenantId, Temporal.PlainDate.from('2026-04-01'))).toBe(1);

		const expired = await entries(tenant.tenantId, 'expiry');
		expect(expired).toEqual([
			{
				name: 'Werner',
				bucket_year: 2025,
				days: '-4.00',
				effective_date: '2026-03-31',
				notice_id: expect.any(String),
				dedupe_key: `vacation-expiry:${tenant.worker.employeeId}:2025`
			}
		]);
		expect(await job.expire(tenant.tenantId, Temporal.PlainDate.from('2026-04-02'))).toBe(0);
	});

	it('shows forfeited and kept carry-over side by side in the accounts', async () => {
		today(api, '2026-04-02T08:00:00Z');
		const worker = await tenant.hr.desk.get(
			`/employees/${tenant.worker.employeeId}/vacation?year=2026`
		);
		expect(worker.body.buckets[0]).toMatchObject({
			year: 2025,
			expired: '4.00',
			remaining: '0.00',
			expiry: { decision: 'forfeit' }
		});

		const colleague = await tenant.hr.desk.get(
			`/employees/${tenant.colleague.employeeId}/vacation?year=2026`
		);
		expect(colleague.body.buckets[0]).toMatchObject({
			year: 2025,
			remaining: '4.00',
			expiry: { decision: 'keep' }
		});
		expect(colleague.body.available).toBe('4.00');
	});
});
