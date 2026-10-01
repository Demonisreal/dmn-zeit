import type pg from 'pg';
import { insertId } from './pg';

export function seedBillingProfile(db: pg.Client, tenantId: string, prefix = 'RE') {
	return db.query(
		`insert into app.billing_profiles (tenant_id, legal_name, street, postal_code, city, tax_number, invoice_prefix)
		 values ($1, 'Erika Muster', 'Musterweg 1', '48143', 'Münster', '133/8150/8159', $2)`,
		[tenantId, prefix]
	);
}

export function seedClient(db: pg.Client, tenantId: string, name = 'Bäckerei Korn') {
	return insertId(db, 'insert into app.clients (tenant_id, name) values ($1, $2) returning id', [
		tenantId,
		name
	]);
}

export async function seedDraft(db: pg.Client, tenantId: string, clientId: string) {
	const draftId = await insertId(
		db,
		`insert into app.invoices (tenant_id, client_id, service_from, service_to, payment_terms_days, format, tax_profile)
		 values ($1, $2, '2026-02-01', '2026-02-28', 14, 'pdf', 'regular') returning id`,
		[tenantId, clientId]
	);
	await db.query(
		`insert into app.invoice_lines (
			tenant_id, invoice_id, client_id, position, kind, description, quantity_milli, unit,
			unit_price_cents, net_cents, tax_category, tax_rate_bp
		 ) values ($1, $2, $3, 1, 'item', 'Beratung', 1000, 'HUR', 5000, 5000, 'standard', 1900)`,
		[tenantId, draftId, clientId]
	);
	return draftId;
}
