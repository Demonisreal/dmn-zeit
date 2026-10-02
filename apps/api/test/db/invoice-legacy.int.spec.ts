import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedBillingProfile, seedClient, seedDraft } from '../helpers/invoices';
import { connectAs, createTenant, createUser, type Account, withContext } from '../helpers/pg';

let superuser: pg.Client;
let app: pg.Client;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
});

const REASON = 'Steuerfrei nach § 4 Nr. 14 UStG';

type Draft = { tenant: string; id: string; client: string };

function errorCode(attempt: Promise<unknown>) {
	return attempt.then(
		() => 'applied',
		(error: { code: string }) => error.code
	);
}

async function office(kind: 'live' | 'sandbox' = 'live') {
	const tenant = await createTenant({ kind });
	const hr = await createUser(tenant, { role: 'hr' });
	if (kind === 'live') await seedBillingProfile(superuser, tenant);
	return { tenant, hr, client: await seedClient(superuser, tenant) };
}

async function draftOf(tenant: string, client: string): Promise<Draft> {
	return { tenant, client, id: await seedDraft(superuser, tenant, client) };
}

function addExemptLine(db: pg.Client, draft: Draft, position: number, reason: string | null) {
	return db.query(
		`insert into app.invoice_lines (
			tenant_id, invoice_id, client_id, position, kind, description, quantity_milli, unit,
			unit_price_cents, net_cents, tax_category, tax_rate_bp, exemption_reason
		 ) values ($1, $2, $3, $4, 'item', 'Heilbehandlung', 1000, 'HUR', 8000, 8000, 'exempt', 0, $5)`,
		[draft.tenant, draft.id, draft.client, position, reason]
	);
}

async function asBefore(write: () => Promise<unknown>) {
	await superuser.query('begin');
	await superuser.query('set local session_replication_role = replica');
	await write();
	await superuser.query('commit');
}

function switchToSmallBusiness(tenant: string) {
	return superuser.query(
		`update app.billing_profiles set tax_profile = 'small_business', previous_year_revenue_cents = 2400000
		  where tenant_id = $1`,
		[tenant]
	);
}

async function issue(account: Account, draftId: string) {
	await withContext(app, account.context);
	const { rows } = await app.query('select * from app.issue_invoice($1)', [draftId]);
	return rows[0];
}

async function cancel(account: Account, invoiceId: string) {
	await withContext(app, account.context);
	const { rows } = await app.query(
		`select * from app.invoice_cancel($1, 'Leistung wurde nicht erbracht')`,
		[invoiceId]
	);
	return rows[0];
}

async function lastSeq(tenantId: string) {
	const { rows } = await superuser.query(
		'select last_seq from app.invoice_counters where tenant_id = $1',
		[tenantId]
	);
	return rows[0]?.last_seq as number | undefined;
}

describe('an exempt line issued before it needed a reason', () => {
	it('is cancelled and lands on the cancellation as it stood', async () => {
		const { tenant, hr, client } = await office();
		const draft = await draftOf(tenant, client);
		await asBefore(() => addExemptLine(superuser, draft, 2, null));
		const original = await issue(hr, draft.id);

		const cancellation = await cancel(hr, original.id);
		expect(cancellation.gross_cents).toBe('-13950');
		const { rows } = await superuser.query(
			`select position, tax_category::text, exemption_reason
			   from app.invoice_lines where invoice_id = $1 order by position`,
			[cancellation.id]
		);
		expect(rows).toEqual([
			{ position: 1, tax_category: 'standard', exemption_reason: null },
			{ position: 2, tax_category: 'exempt', exemption_reason: null }
		]);
	});

	it('holds up its open draft until hr gives the reason', async () => {
		const { tenant, hr, client } = await office();
		const draft = await draftOf(tenant, client);
		await asBefore(() => addExemptLine(superuser, draft, 2, null));
		await withContext(app, hr.context);
		const edit = (column: string, value: string | null) =>
			errorCode(
				app.query(
					`update app.invoice_lines set ${column} = $2 where invoice_id = $1 and position = 2`,
					[draft.id, value]
				)
			);

		expect(await edit('description', 'Physiotherapie')).toBe('23514');
		expect(await edit('exemption_reason', REASON)).toBe('applied');
		expect(await edit('exemption_reason', null)).toBe('23514');
		expect(await errorCode(addExemptLine(app, draft, 3, null))).toBe('23514');
	});
});

describe('addresses of a cancellation', () => {
	it('come from the original, even when its frozen seller and buyer lack the street', async () => {
		const { tenant, hr, client } = await office();
		await superuser.query(
			`update app.clients set street = 'Hafenweg 3', postal_code = '48155', city = 'Münster' where id = $1`,
			[client]
		);
		const draft = await draftOf(tenant, client);
		await superuser.query(
			'update app.invoice_lines set unit_price_cents = 30000, net_cents = 30000 where invoice_id = $1',
			[draft.id]
		);
		const original = await issue(hr, draft.id);
		await asBefore(() =>
			superuser.query(
				`update app.invoices set seller = seller - 'street', buyer = buyer - 'street' where id = $1`,
				[original.id]
			)
		);
		const { rows } = await superuser.query('select seller, buyer from app.invoices where id = $1', [
			original.id
		]);

		const cancellation = await cancel(hr, original.id);
		expect(cancellation).toMatchObject({
			gross_cents: '-35700',
			seller: rows[0].seller,
			buyer: rows[0].buyer
		});
		expect(cancellation.seller).not.toHaveProperty('street');
	});
});

describe('tax profile of a draft', () => {
	it('has to match the billing profile when a live invoice is issued', async () => {
		const { tenant, hr, client } = await office();
		const draft = await draftOf(tenant, client);
		await switchToSmallBusiness(tenant);

		await expect(issue(hr, draft.id)).rejects.toMatchObject({
			code: 'ZT003',
			message: expect.stringContaining('drafted as regular, the billing profile is small_business')
		});
		expect(await lastSeq(tenant)).toBeUndefined();

		await withContext(app, hr.context);
		await app.query(
			`update app.invoices set tax_profile = 'small_business', tax_treatment = 'small_business'
			  where id = $1`,
			[draft.id]
		);
		await app.query(
			`update app.invoice_lines set tax_category = 'small_business', tax_rate_bp = 0 where invoice_id = $1`,
			[draft.id]
		);
		expect(await issue(hr, draft.id)).toMatchObject({
			status: 'issued',
			tax_profile: 'small_business',
			gross_cents: '5000'
		});

		expect(
			await errorCode(
				app.query(
					`update app.invoices set tax_profile = 'regular', tax_treatment = 'standard' where id = $1`,
					[draft.id]
				)
			)
		).toBe('ZT002');
	});

	it('is not compared on a cancellation or in a sandbox', async () => {
		const live = await office();
		const original = await issue(live.hr, (await draftOf(live.tenant, live.client)).id);
		await switchToSmallBusiness(live.tenant);
		expect((await cancel(live.hr, original.id)).tax_profile).toBe('regular');

		const sandbox = await office('sandbox');
		await seedBillingProfile(superuser, sandbox.tenant);
		await switchToSmallBusiness(sandbox.tenant);
		expect(
			await issue(sandbox.hr, (await draftOf(sandbox.tenant, sandbox.client)).id)
		).toMatchObject({
			status: 'issued',
			tax_profile: 'regular'
		});
	});
});

describe('issued invoices of a sandbox', () => {
	it('stop at 30, and one of them can still be cancelled there', async () => {
		const { tenant, hr, client } = await office('sandbox');
		const issued: string[] = [];
		for (let i = 0; i < 30; i++) {
			issued.push((await issue(hr, (await draftOf(tenant, client)).id)).id);
		}
		const extra = await draftOf(tenant, client);

		await expect(issue(hr, extra.id)).rejects.toMatchObject({ code: 'ZT005' });
		expect((await cancel(hr, issued[0]!)).number).toMatch(/^MUSTER-\d{4}-0031$/);
		await expect(issue(hr, extra.id)).rejects.toMatchObject({ code: 'ZT005' });
	});
});
