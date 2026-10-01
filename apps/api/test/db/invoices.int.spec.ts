import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	connectAs,
	createPerson,
	createTenant,
	createUser,
	insertId,
	type Account,
	withContext
} from '../helpers/pg';

let superuser: pg.Client;
let app: pg.Client;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
});

async function seedBillingProfile(tenantId: string) {
	await superuser.query(
		`insert into app.billing_profiles (tenant_id, legal_name, street, postal_code, city, tax_number, invoice_prefix)
		 values ($1, 'Erika Muster', 'Musterweg 1', '48143', 'Münster', '133/8150/8159', 'RE')`,
		[tenantId]
	);
}

function seedClient(tenantId: string) {
	return insertId(
		superuser,
		`insert into app.clients (tenant_id, name) values ($1, 'Bäckerei Korn') returning id`,
		[tenantId]
	);
}

function seedDraft(tenantId: string, clientId: string, taxProfile = 'regular') {
	return insertId(
		superuser,
		`insert into app.invoices (tenant_id, client_id, service_from, service_to, payment_terms_days, format, tax_profile)
		 values ($1, $2, '2026-02-01', '2026-02-28', 14, 'pdf', $3) returning id`,
		[tenantId, clientId, taxProfile]
	);
}

async function seedIssuable(tenantId: string, clientId: string) {
	const draftId = await seedDraft(tenantId, clientId);
	await superuser.query(
		`insert into app.invoice_lines (
			tenant_id, invoice_id, client_id, position, kind, description, quantity_milli, unit,
			unit_price_cents, net_cents, tax_category, tax_rate_bp
		 ) values ($1, $2, $3, 1, 'item', 'Beratung', 1000, 'HUR', 5000, 5000, 'standard', 1900)`,
		[tenantId, draftId, clientId]
	);
	return draftId;
}

describe('immutability of an issued invoice', () => {
	let tenant: string;
	let hr: Account;
	let invoiceId: string;

	beforeAll(async () => {
		tenant = await createTenant();
		hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);
		const clientId = await seedClient(tenant);
		const draftId = await seedIssuable(tenant, clientId);
		await withContext(app, hr.context);
		const { rows } = await app.query('select (app.issue_invoice($1)).id as id', [draftId]);
		invoiceId = rows[0].id;
	});

	it('keeps the number, dates and snapshots out of reach of a column grant', async () => {
		await withContext(app, hr.context);
		for (const change of [
			`number = 'RE-2026-9999'`,
			`issue_date = current_date`,
			`net_cents = 0`,
			`seller = '{}'::jsonb`,
			`issued_at = now()`
		]) {
			await expect(
				app.query(`update app.invoices set ${change} where id = $1`, [invoiceId])
			).rejects.toMatchObject({ code: '42501' });
		}
	});

	it('freezes every business field once issued, for hr as well', async () => {
		await withContext(app, hr.context);
		for (const change of [
			`client_id = gen_random_uuid()`,
			`service_from = '2026-01-01'`,
			`tax_profile = 'small_business'`,
			`format = 'xrechnung'`
		]) {
			await expect(
				app.query(`update app.invoices set ${change} where id = $1`, [invoiceId])
			).rejects.toMatchObject({ code: 'ZT002' });
		}
	});

	it('still lets the payment status move', async () => {
		await withContext(app, hr.context);
		const paid = await app.query(
			`update app.invoices set status = 'paid', paid_on = current_date where id = $1`,
			[invoiceId]
		);
		expect(paid.rowCount).toBe(1);
	});
});

describe('numbering under concurrency', () => {
	it('hands out 1 through 20 exactly once', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);
		const clientId = await seedClient(tenant);
		const drafts = await Promise.all(
			Array.from({ length: 20 }, () => seedIssuable(tenant, clientId))
		);

		const connections = await Promise.all(Array.from({ length: 20 }, () => connectAs('app')));
		await Promise.all(connections.map((client) => withContext(client, hr.context)));
		const issued = await Promise.all(
			connections.map((client, i) =>
				client.query('select (app.issue_invoice($1)).number_seq as seq', [drafts[i]])
			)
		);

		const seqs = issued.map((r) => r.rows[0].seq as number).sort((a, b) => a - b);
		expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
	});

	it('gives a number back after a rollback, the next issue gets the same one', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);
		const clientId = await seedClient(tenant);
		const first = await seedIssuable(tenant, clientId);
		const second = await seedIssuable(tenant, clientId);
		await withContext(app, hr.context);

		await app.query('begin');
		const rolledBack = await app.query('select (app.issue_invoice($1)).number_seq as seq', [first]);
		await app.query('rollback');

		const kept = await app.query('select (app.issue_invoice($1)).number_seq as seq', [second]);
		expect(kept.rows[0].seq).toBe(rolledBack.rows[0].seq);
	});
});

describe('billing lock on project entries', () => {
	it('locks a booked entry until its invoice is cancelled, then frees it', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		const worker = await createPerson(tenant);
		await seedBillingProfile(tenant);
		const clientId = await seedClient(tenant);
		const project = await insertId(
			superuser,
			`insert into app.projects (tenant_id, client_id, name) values ($1, $2, 'Website') returning id`,
			[tenant, clientId]
		);
		await superuser.query(
			'insert into app.project_members (tenant_id, project_id, employee_id) values ($1, $2, $3)',
			[tenant, project, worker.employeeId]
		);

		await withContext(app, worker.context);
		const entryId = await insertId(
			app,
			`insert into app.project_entries (tenant_id, employee_id, project_id, started_at, ended_at, note, source)
			 values ($1, $2, $3, '2026-03-02 09:00+01', '2026-03-02 10:00+01', 'Startseite', 'manual') returning id`,
			[tenant, worker.employeeId, project]
		);

		const draftId = await seedIssuable(tenant, clientId);
		await withContext(app, hr.context);
		await app.query('update app.project_entries set invoice_id = $1 where id = $2', [
			draftId,
			entryId
		]);
		await expect(
			app.query(`update app.project_entries set note = 'Geändert' where id = $1`, [entryId])
		).rejects.toMatchObject({ code: 'ZT004' });

		const { rows } = await app.query('select (app.issue_invoice($1)).id as id', [draftId]);
		const invoiceId = rows[0].id as string;
		await expect(
			app.query(`update app.project_entries set note = 'Noch gesperrt' where id = $1`, [entryId])
		).rejects.toMatchObject({ code: 'ZT004' });

		await app.query(`select app.invoice_cancel($1, 'Kunde storniert den Auftrag')`, [invoiceId]);

		const freed = await superuser.query('select invoice_id from app.project_entries where id = $1', [
			entryId
		]);
		expect(freed.rows[0].invoice_id).toBeNull();

		const edited = await app.query(`update app.project_entries set note = 'Wieder frei' where id = $1`, [
			entryId
		]);
		expect(edited.rowCount).toBe(1);
	});
});

describe('tenant retention', () => {
	it('keeps a live tenant with an issued invoice, even for the superuser', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);
		const clientId = await seedClient(tenant);
		const draftId = await seedIssuable(tenant, clientId);
		await withContext(app, hr.context);
		await app.query('select app.issue_invoice($1)', [draftId]);

		await expect(
			superuser.query('delete from app.tenants where id = $1', [tenant])
		).rejects.toMatchObject({ code: 'ZT002' });
	});
});

describe('tax category', () => {
	it('rejects a taxed line on a small-business invoice', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		const clientId = await seedClient(tenant);
		const draftId = await seedDraft(tenant, clientId, 'small_business');
		await withContext(app, hr.context);

		await expect(
			app.query(
				`insert into app.invoice_lines (
					tenant_id, invoice_id, client_id, position, kind, description, quantity_milli, unit,
					unit_price_cents, net_cents, tax_category, tax_rate_bp
				 ) values ($1, $2, $3, 1, 'item', 'Beratung', 1000, 'HUR', 5000, 5000, 'standard', 1900)`,
				[tenant, draftId, clientId]
			)
		).rejects.toMatchObject({ code: '23514' });

		const accepted = await app.query(
			`insert into app.invoice_lines (
				tenant_id, invoice_id, client_id, position, kind, description, quantity_milli, unit,
				unit_price_cents, net_cents, tax_category, tax_rate_bp
			 ) values ($1, $2, $3, 1, 'item', 'Beratung', 1000, 'HUR', 5000, 5000, 'small_business', 0) returning id`,
			[tenant, draftId, clientId]
		);
		expect(accepted.rowCount).toBe(1);
	});
});
