import type pg from 'pg';
import { insertId } from '../helpers/pg';

// clients and projects written as superuser, the api for them has its own tests in the role matrix
export function createClient(db: pg.Client, tenantId: string, name = 'Bäckerei Korn') {
	return insertId(db, 'insert into app.clients (tenant_id, name) values ($1, $2) returning id', [
		tenantId,
		name
	]);
}

export function createProject(
	db: pg.Client,
	tenantId: string,
	clientId: string,
	options: { name?: string; openToAll?: boolean; budgetMinutes?: number } = {}
) {
	return insertId(
		db,
		`insert into app.projects (tenant_id, client_id, name, open_to_all, budget_minutes)
		 values ($1, $2, $3, $4, $5) returning id`,
		[
			tenantId,
			clientId,
			options.name ?? 'Website',
			options.openToAll ?? true,
			options.budgetMinutes ?? null
		]
	);
}

// since stage 10d invoice_id has to point at a real row, so this seeds a bare draft for the entry's client
export async function invoice(db: pg.Client, entryId: string) {
	await db.query('begin');
	await db.query(`select set_config('app.role', 'hr', true)`);
	const { rows } = await db.query<{ tenant_id: string; client_id: string }>(
		`select e.tenant_id, p.client_id from app.project_entries e
		 join app.projects p on p.id = e.project_id where e.id = $1`,
		[entryId]
	);
	const draftId = await insertId(
		db,
		`insert into app.invoices (tenant_id, client_id, service_from, service_to, payment_terms_days, format, tax_profile)
		 values ($1, $2, current_date, current_date, 14, 'pdf', 'regular') returning id`,
		[rows[0]!.tenant_id, rows[0]!.client_id]
	);
	await db.query('update app.project_entries set invoice_id = $1 where id = $2', [draftId, entryId]);
	await db.query('commit');
}
