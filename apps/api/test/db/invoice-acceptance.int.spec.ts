import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedBillingProfile, seedClient, seedDraft } from '../helpers/invoices';
import { connectAs, createTenant, createUser, type Account, withContext } from '../helpers/pg';
import { fillTenant } from './fixtures';

let superuser: pg.Client;
let app: pg.Client;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
});

type Column = { table: string; name: string; type: string; udt: string };

const movable = [
	'status',
	'paid_on',
	'cancelled_at',
	'cancelled_by',
	'cancel_reason',
	'updated_at'
];

async function issue(hr: Account, draftId: string) {
	await withContext(app, hr.context);
	const { rows } = await app.query<{ number: string; number_seq: number }>(
		'select number, number_seq from app.issue_invoice($1)',
		[draftId]
	);
	return rows[0]!;
}

function changed({ name, type, udt }: Column) {
	const column = `"${name}"`;
	if (type === 'USER-DEFINED') {
		return `(select v from unnest(enum_range(null::${udt})) v where v is distinct from ${column} limit 1)`;
	}
	return {
		uuid: 'gen_random_uuid()',
		text: `coalesce(${column}, '') || 'x'`,
		smallint: `coalesce(${column}, 0) + 1`,
		integer: `coalesce(${column}, 0) + 1`,
		bigint: `coalesce(${column}, 0) + 1`,
		boolean: `not coalesce(${column}, false)`,
		date: `coalesce(${column}, current_date) + 1`,
		'timestamp with time zone': `coalesce(${column}, now()) + interval '1 minute'`,
		jsonb: `coalesce(${column}, '{}') || '{"x": 1}'`,
		bytea: `coalesce(${column}, ''::bytea) || decode('00', 'hex')`
	}[type];
}

function errorCode(attempt: Promise<unknown>) {
	return attempt.then(
		() => 'applied',
		(error: { code: string }) => error.code
	);
}

describe('an issued invoice, column by column', () => {
	let tenant: string;
	let invoiceId: string;
	let admin: Account;
	let columns: Column[];
	let before: unknown;

	const snapshot = async () =>
		(
			await superuser.query(
				`select (select to_jsonb(i) from app.invoices i where i.id = $1) as invoice,
				        (select jsonb_agg(to_jsonb(l) order by l.position) from app.invoice_lines l where l.invoice_id = $1) as lines,
				        (select jsonb_agg(to_jsonb(e)) from app.invoice_line_entries e where e.invoice_id = $1) as entries,
				        (select jsonb_agg(to_jsonb(d)) from app.invoice_documents d where d.invoice_id = $1) as documents`,
				[invoiceId]
			)
		).rows[0];

	beforeAll(async () => {
		tenant = await createTenant();
		({ invoice: invoiceId } = await fillTenant(superuser, tenant));
		admin = await createUser(tenant, { role: 'admin' });

		const { rows } = await superuser.query<Column>(
			`select table_name as "table", column_name as name, data_type as type, udt_schema || '.' || udt_name as udt
			   from information_schema.columns
			  where table_schema = 'app'
			    and table_name in ('invoices', 'invoice_lines', 'invoice_line_entries', 'invoice_documents')
			    and is_generated = 'NEVER'
			    and not (table_name = 'invoices' and column_name = any ($1))
			  order by table_name, ordinal_position`,
			[movable]
		);
		columns = rows;
		before = await snapshot();
	});

	it('covers all four tables and leaves only retain_until to the generator', async () => {
		expect(new Set(columns.map((column) => column.table))).toEqual(
			new Set(['invoices', 'invoice_lines', 'invoice_line_entries', 'invoice_documents'])
		);
		const { rows } = await superuser.query(
			`select table_name, column_name, generation_expression from information_schema.columns
			  where table_schema = 'app' and table_name like 'invoice%' and is_generated = 'ALWAYS'`
		);
		expect(rows).toEqual([
			expect.objectContaining({ table_name: 'invoices', column_name: 'retain_until' })
		]);
	});

	it('refuses every column but status and payment to the superuser with ZT002', async () => {
		for (const column of columns) {
			const key = column.table === 'invoices' ? 'id' : 'invoice_id';
			const code = await errorCode(
				superuser.query(
					`update app.${column.table} set "${column.name}" = ${changed(column)} where ${key} = $1`,
					[invoiceId]
				)
			);
			expect({ column: `${column.table}.${column.name}`, code }).toEqual({
				column: `${column.table}.${column.name}`,
				code: 'ZT002'
			});
		}
		expect(await snapshot()).toEqual(before);
	});

	it('refuses every column to zeit_app with an admin context, by grant or by guard', async () => {
		await withContext(app, admin.context);
		for (const column of columns) {
			const key = column.table === 'invoices' ? 'id' : 'invoice_id';
			const code = await errorCode(
				app.query(
					`update app.${column.table} set "${column.name}" = ${changed(column)} where ${key} = $1`,
					[invoiceId]
				)
			);
			expect(['42501', 'ZT002'], `${column.table}.${column.name}: ${code}`).toContain(code);
		}
		expect(await snapshot()).toEqual(before);
	});

	it('takes no new position or booking onto the issued invoice', async () => {
		await withContext(app, admin.context);
		const { rows } = await superuser.query(
			`select l.client_id, l.id as line_id, e.entry_id
			   from app.invoice_lines l join app.invoice_line_entries e on e.line_id = l.id
			  where l.invoice_id = $1`,
			[invoiceId]
		);
		const [{ client_id: clientId, line_id: lineId, entry_id: entryId }] = rows;

		const addLine = `insert into app.invoice_lines (
				tenant_id, invoice_id, client_id, position, kind, description, quantity_milli, unit,
				unit_price_cents, net_cents, tax_category, tax_rate_bp
			 ) values ($1, $2, $3, 9, 'item', 'Nachtrag', 1000, 'HUR', 100, 100, 'standard', 1900)`;
		const addEntry = `insert into app.invoice_line_entries (tenant_id, invoice_id, line_id, entry_id)
			 values ($1, $2, $3, $4)`;
		for (const db of [app, superuser]) {
			expect(await errorCode(db.query(addLine, [tenant, invoiceId, clientId]))).toBe('ZT002');
			expect(await errorCode(db.query(addEntry, [tenant, invoiceId, lineId, entryId]))).toBe(
				'ZT002'
			);
		}
		expect(await snapshot()).toEqual(before);
	});

	it('lets no position or booking move over to a draft of the same client', async () => {
		const clientId = (
			await superuser.query('select client_id from app.invoices where id = $1', [invoiceId])
		).rows[0].client_id;
		const draftId = await seedDraft(superuser, tenant, clientId);
		const draftLine = (
			await superuser.query('select id from app.invoice_lines where invoice_id = $1', [draftId])
		).rows[0].id;

		expect(
			await errorCode(
				superuser.query('update app.invoice_lines set invoice_id = $2 where invoice_id = $1', [
					invoiceId,
					draftId
				])
			)
		).toBe('ZT002');
		expect(
			await errorCode(
				superuser.query(
					'update app.invoice_line_entries set invoice_id = $2, line_id = $3 where invoice_id = $1',
					[invoiceId, draftId, draftLine]
				)
			)
		).toBe('ZT002');
		expect(await snapshot()).toEqual(before);
	});

	it('deletes nothing of it, not even with zeit.purge_tenant set by zeit_app', async () => {
		for (const table of ['invoice_documents', 'invoice_line_entries', 'invoice_lines']) {
			expect(
				await errorCode(
					superuser.query(`delete from app.${table} where invoice_id = $1`, [invoiceId])
				),
				table
			).toBe('ZT002');
		}
		expect(
			await errorCode(superuser.query('delete from app.invoices where id = $1', [invoiceId]))
		).toBe('ZT002');

		await withContext(app, admin.context);
		expect(await errorCode(app.query('delete from app.invoices where id = $1', [invoiceId]))).toBe(
			'ZT002'
		);
		expect(
			await errorCode(app.query('delete from app.invoice_lines where invoice_id = $1', [invoiceId]))
		).toBe('ZT002');

		await app.query('begin');
		await app.query(`select set_config('zeit.purge_tenant', $1, true)`, [tenant]);
		const purged = await errorCode(
			app.query('delete from app.invoices where id = $1', [invoiceId])
		);
		await app.query('rollback');
		expect(purged).toBe('ZT002');
		expect(await snapshot()).toEqual(before);
	});
});

describe('status transitions', () => {
	let hr: Account;
	let tenant: string;
	let clientId: string;

	beforeAll(async () => {
		tenant = await createTenant();
		hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(superuser, tenant);
		clientId = await seedClient(superuser, tenant);
	});

	async function issuedInvoice() {
		const draftId = await seedDraft(superuser, tenant, clientId);
		await issue(hr, draftId);
		return draftId;
	}

	const move = (id: string, change: string) =>
		errorCode(app.query(`update app.invoices set ${change} where id = $1`, [id]));

	it('moves between issued and paid in both directions', async () => {
		const invoiceId = await issuedInvoice();
		await withContext(app, hr.context);
		expect(await move(invoiceId, `status = 'paid', paid_on = current_date`)).toBe('applied');
		expect(await move(invoiceId, `status = 'issued', paid_on = null`)).toBe('applied');
	});

	it('never goes back to draft, from issued or from paid', async () => {
		const issuedId = await issuedInvoice();
		const paidId = await issuedInvoice();
		await withContext(app, hr.context);
		await move(paidId, `status = 'paid', paid_on = current_date`);

		expect(await move(issuedId, `status = 'draft'`)).toBe('ZT003');
		expect(await move(paidId, `status = 'draft', paid_on = null`)).toBe('ZT003');
	});

	it('reaches cancelled only through an issued cancellation, and never leaves it', async () => {
		const invoiceId = await issuedInvoice();
		await withContext(app, hr.context);
		expect(await move(invoiceId, `status = 'cancelled'`)).toBe('ZT003');

		const { rows } = await app.query(
			`select id from app.invoice_cancel($1, 'Fehlerhafte Anschrift beim Kunden')`,
			[invoiceId]
		);
		const cancellationId = rows[0].id as string;
		const original = await superuser.query('select status from app.invoices where id = $1', [
			invoiceId
		]);
		expect(original.rows[0].status).toBe('cancelled');

		expect(await move(invoiceId, `status = 'issued'`)).toBe('ZT003');
		expect(await move(invoiceId, `status = 'paid', paid_on = current_date`)).toBe('ZT003');
		expect(await move(cancellationId, `status = 'cancelled'`)).toBe('ZT003');
	});

	it('keeps a second cancellation row out, even for the superuser', async () => {
		const invoiceId = await issuedInvoice();
		await withContext(app, hr.context);
		await app.query(`select app.invoice_cancel($1, 'Leistung wurde nicht erbracht')`, [invoiceId]);

		expect(
			await errorCode(
				superuser.query(
					`insert into app.invoices (tenant_id, kind, client_id, refers_to_id, service_from, service_to,
						payment_terms_days, format, tax_profile)
					 values ($1, 'cancellation', $2, $3, '2026-02-01', '2026-02-28', 14, 'pdf', 'regular')`,
					[tenant, clientId, invoiceId]
				)
			)
		).toBe('23505');
	});
});

describe('invoice number', () => {
	async function issuedWith(prefix: string, lastSeq?: number) {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(superuser, tenant, prefix);
		const draftId = await seedDraft(superuser, tenant, await seedClient(superuser, tenant));
		const year = (
			await superuser.query(
				`select extract(year from now() at time zone 'Europe/Berlin')::int as y`
			)
		).rows[0].y as number;
		if (lastSeq !== undefined) {
			await superuser.query(
				'insert into app.invoice_counters (tenant_id, year, last_seq) values ($1, $2, $3)',
				[tenant, year, lastSeq]
			);
		}
		return { year, issued: await issue(hr, draftId) };
	}

	it('puts prefix, year and a four-digit sequence together with dashes', async () => {
		const plain = await issuedWith('RE');
		expect(plain.issued).toEqual({ number: `RE-${plain.year}-0001`, number_seq: 1 });

		const dashed = await issuedWith('RE-');
		expect(dashed.issued.number).toBe(`RE-${dashed.year}-0001`);

		const bare = await issuedWith('');
		expect(bare.issued.number).toBe(`${bare.year}-0001`);
	});

	it('keeps counting past 9999 without cutting the sequence', async () => {
		const { year, issued } = await issuedWith('RE', 9999);
		expect(issued).toEqual({ number: `RE-${year}-10000`, number_seq: 10000 });
	});
});

describe('deletion', () => {
	it('drops a draft but keeps a client that has an invoice', async () => {
		const tenant = await createTenant();
		const admin = await createUser(tenant, { role: 'admin' });
		await seedBillingProfile(superuser, tenant);
		const clientId = await seedClient(superuser, tenant);
		const draftId = await seedDraft(superuser, tenant, clientId);
		const issuedId = await seedDraft(superuser, tenant, clientId);
		await issue(admin, issuedId);

		await withContext(app, admin.context);
		expect((await app.query('delete from app.invoices where id = $1', [draftId])).rowCount).toBe(1);
		expect(await errorCode(app.query('delete from app.clients where id = $1', [clientId]))).toBe(
			'23503'
		);
	});

	it('holds a live tenant through the purge path even without the general delete guard, until retain_until', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(superuser, tenant);
		const draftId = await seedDraft(superuser, tenant, await seedClient(superuser, tenant));
		await issue(hr, draftId);

		const purge = async () => {
			await superuser.query('set local role zeit_system');
			await superuser.query(`select set_config('zeit.purge_tenant', $1, true)`, [tenant]);
			await superuser.query('savepoint purge');
			const outcome = await superuser.query('delete from app.tenants where id = $1', [tenant]).then(
				(deleted) => `deleted ${deleted.rowCount}`,
				(error: { code: string; message: string }) => `${error.code} ${error.message}`
			);
			await superuser.query(
				outcome.startsWith('deleted') ? 'release savepoint purge' : 'rollback to savepoint purge'
			);
			await superuser.query('reset role');
			return outcome;
		};

		await superuser.query('begin');
		await superuser.query('alter table app.tenants disable trigger tenants_guard_delete');
		const kept = await purge();

		await superuser.query('set local session_replication_role = replica');
		await superuser.query('update app.invoices set number_year = 2017 where id = $1', [draftId]);
		await superuser.query('set local session_replication_role = origin');
		const expired = await purge();
		await superuser.query('rollback');

		expect(kept).toMatch(/^ZT002 .*retention period/);
		expect(expired).toBe('deleted 1');
	});
});
