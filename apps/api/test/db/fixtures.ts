import type pg from 'pg';
import { createContract, createPerson, createTeam, createUser, insertId } from '../helpers/pg';

// at least one row in every table that belongs to a tenant, for the tests that sweep all of them
export async function fillTenant(db: pg.Client, tenantId: string) {
	const team = await createTeam(tenantId);
	const lead = await createPerson(tenantId, { role: 'team_lead', teamId: team, leads: team });
	const worker = await createPerson(tenantId, { teamId: team });
	const hr = await createUser(tenantId, { role: 'hr' });
	await createContract(tenantId, worker.employeeId);

	const entry = await insertId(
		db,
		`insert into app.time_entries (tenant_id, employee_id, started_at, ended_at, end_reason, source)
		 values ($1, $2, '2026-02-02 08:00+01', '2026-02-02 12:00+01', 'leave', 'seed') returning id`,
		[tenantId, worker.employeeId]
	);
	await db.query(
		`insert into app.correction_requests (tenant_id, employee_id, action, target_entry_id, reason, requested_by)
		 values ($1, $2, 'void', $3, 'Doppelt gestempelt, bitte streichen', $4)`,
		[tenantId, worker.employeeId, entry, worker.userId]
	);
	await db.query(
		`insert into app.finding_acks (tenant_id, employee_id, work_date, rule_code, rule_version, note, created_by)
		 values ($1, $2, '2026-02-02', 'ARBZG_4_BREAK_SHORT', '2026.1', 'Pause war abgesprochen', $3)`,
		[tenantId, worker.employeeId, lead.userId]
	);

	const absence = await insertId(
		db,
		`insert into app.absence_requests (tenant_id, employee_id, type, start_date, end_date, requested_by)
		 values ($1, $2, 'vacation', '2026-03-02', '2026-03-06', $3) returning id`,
		[tenantId, worker.employeeId, worker.userId]
	);
	await db.query(
		`insert into app.absence_days (tenant_id, employee_id, absence_id, date, portion, target_minutes, vacation_days)
		 values ($1, $2, $3, '2026-03-02', 1, 480, 1)`,
		[tenantId, worker.employeeId, absence]
	);
	const notice = await insertId(
		db,
		`insert into app.vacation_notices (tenant_id, employee_id, bucket_year, remaining_days, deadline, sent_by, channel, text_version)
		 values ($1, $2, 2025, 4, '2026-03-31', $3, 'in_app', 'v1') returning id`,
		[tenantId, worker.employeeId, hr.userId]
	);
	await db.query(
		`insert into app.vacation_ledger (tenant_id, employee_id, bucket_year, entry_type, days, effective_date, notice_id)
		 values ($1, $2, 2025, 'expiry', -4, '2026-03-31', $3)`,
		[tenantId, worker.employeeId, notice]
	);
	await db.query(
		`insert into app.flex_bookings (tenant_id, employee_id, type, minutes, effective_date, reason)
		 values ($1, $2, 'opening', 120, '2026-01-01', 'Saldo aus dem Vorjahr')`,
		[tenantId, worker.employeeId]
	);
	await db.query(
		`insert into app.month_closings (tenant_id, month, action, created_by)
		 values ($1, '2026-01-01', 'close', $2)`,
		[tenantId, hr.userId]
	);
	await db.query(
		`insert into ops.demo_outbox (tenant_id, recipient, subject, body)
		 values ($1, 'erika@example.test', 'Urlaub genehmigt', 'Ihr Urlaub vom 2. bis 6. März ist genehmigt.')`,
		[tenantId]
	);

	return { team, lead, worker, hr, entry, absence };
}
