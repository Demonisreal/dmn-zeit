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

// there is no invoice api before stage 10d, the guard only lets hr set the column
export async function invoice(db: pg.Client, entryId: string) {
	await db.query('begin');
	await db.query(`select set_config('app.role', 'hr', true)`);
	await db.query('update app.project_entries set invoice_id = gen_random_uuid() where id = $1', [
		entryId
	]);
	await db.query('commit');
}
