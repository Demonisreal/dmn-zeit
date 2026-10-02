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

	const client = await insertId(
		db,
		`insert into app.clients (tenant_id, number, name, city) values ($1, 'K-1001', 'Bäckerei Korn', 'Münster') returning id`,
		[tenantId]
	);
	const project = await insertId(
		db,
		`insert into app.projects (tenant_id, client_id, name, open_to_all)
		 values ($1, $2, 'Jahresabschluss 2025', false) returning id`,
		[tenantId, client]
	);
	const task = await insertId(
		db,
		`insert into app.tasks (tenant_id, client_id, project_id, name) values ($1, $2, $3, 'Belege sichten') returning id`,
		[tenantId, client, project]
	);
	await db.query(
		'insert into app.project_members (tenant_id, project_id, employee_id) values ($1, $2, $3)',
		[tenantId, project, worker.employeeId]
	);
	await db.query(
		`insert into app.rates (tenant_id, client_id, valid_from, rate_cents, created_by)
		 values ($1, $2, '2026-01-01', 9500, $3)`,
		[tenantId, client, hr.userId]
	);
	// without a context the guard asks for the release of the project, hr books past it
	await db.query('begin');
	await db.query(`select set_config('app.role', 'hr', true)`);
	const projectEntry = await insertId(
		db,
		`insert into app.project_entries (tenant_id, employee_id, project_id, task_id, started_at, ended_at, note, source)
		 values ($1, $2, $3, $4, '2026-02-02 13:00+01', '2026-02-02 15:00+01', 'Belege Januar', 'manual') returning id`,
		[tenantId, worker.employeeId, project, task]
	);
	await db.query('commit');

	await db.query(
		`insert into app.billing_profiles (tenant_id, legal_name, street, postal_code, city, tax_number, invoice_prefix)
		 values ($1, 'Erika Muster', 'Musterweg 1', '48143', 'Münster', '133/8150/8159', 'RE')`,
		[tenantId]
	);
	const invoice = await insertId(
		db,
		`insert into app.invoices (
			tenant_id, client_id, service_from, service_to, payment_terms_days, format, tax_profile, created_by
		 ) values ($1, $2, '2026-02-01', '2026-02-28', 14, 'pdf', 'regular', $3) returning id`,
		[tenantId, client, hr.userId]
	);
	const line = await insertId(
		db,
		`insert into app.invoice_lines (
			tenant_id, invoice_id, client_id, position, kind, project_id, description, minutes,
			unit_price_cents, net_cents, tax_category, tax_rate_bp
		 ) values ($1, $2, $3, 1, 'time', $4, 'Belege Januar', 120, 9500, 19000, 'standard', 1900) returning id`,
		[tenantId, invoice, client, project]
	);
	await db.query(
		`insert into app.invoice_line_entries (tenant_id, invoice_id, line_id, entry_id) values ($1, $2, $3, $4)`,
		[tenantId, invoice, line, projectEntry]
	);
	// issuing needs the same session context a definer function reads for itself
	await db.query('begin');
	await db.query(
		`select set_config('app.tenant_id', $1, true), set_config('app.role', 'hr', true)`,
		[tenantId]
	);
	await db.query('select app.issue_invoice($1)', [invoice]);
	await db.query('commit');
	await db.query(
		`insert into app.invoice_documents (tenant_id, invoice_id, format, content, created_by)
		 values ($1, $2, 'pdf', $3, $4)`,
		[tenantId, invoice, Buffer.from('%PDF-1.4 Musterrechnung'), hr.userId]
	);

	return { team, lead, worker, hr, entry, absence, invoice };
}
