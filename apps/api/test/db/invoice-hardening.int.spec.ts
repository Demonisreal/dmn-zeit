import { createHash } from 'node:crypto';
import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	connectAs,
	createPerson,
	createTenant,
	createUser,
	insertId,
	type Account,
	type Person,
	withContext
} from '../helpers/pg';

let superuser: pg.Client;
let app: pg.Client;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
});

const address = { street: 'Hafenweg 3', postalCode: '48155', city: 'Münster' };
const noAddress = { street: null, postalCode: null, city: null };

function seedBillingProfile(tenantId: string, at: typeof address | typeof noAddress = address) {
	return superuser.query(
		`insert into app.billing_profiles (tenant_id, legal_name, street, postal_code, city, tax_number, invoice_prefix)
		 values ($1, 'Erika Muster', $2, $3, $4, '133/8150/8159', 'RE')`,
		[tenantId, at.street, at.postalCode, at.city]
	);
}

function seedClient(tenantId: string, at: typeof address | typeof noAddress = address) {
	return insertId(
		superuser,
		`insert into app.clients (tenant_id, name, street, postal_code, city)
		 values ($1, 'Bäckerei Korn', $2, $3, $4) returning id`,
		[tenantId, at.street, at.postalCode, at.city]
	);
}

function seedProject(tenantId: string, clientId: string) {
	return insertId(
		superuser,
		`insert into app.projects (tenant_id, client_id, name) values ($1, $2, 'Jahresabschluss') returning id`,
		[tenantId, clientId]
	);
}

function addLine(
	db: pg.Client,
	invoice: { tenant: string; id: string; client: string },
	position: number,
	cents: number,
	category = 'standard'
) {
	return db.query(
		`insert into app.invoice_lines (
			tenant_id, invoice_id, client_id, position, kind, description, quantity_milli, unit,
			unit_price_cents, net_cents, tax_category, tax_rate_bp
		 ) values ($1, $2, $3, $4, 'item', 'Beratung', 1000, 'HUR', $5, $5, $6, $7)`,
		[
			invoice.tenant,
			invoice.id,
			invoice.client,
			position,
			cents,
			category,
			category === 'standard' ? 1900 : 0
		]
	);
}

async function seedDraft(
	tenantId: string,
	clientId: string,
	cents: number | null = 5000,
	category = 'standard'
) {
	const id = await insertId(
		superuser,
		`insert into app.invoices (tenant_id, client_id, service_from, service_to, payment_terms_days, format, tax_profile)
		 values ($1, $2, '2026-02-01', '2026-02-28', 14, 'pdf', 'regular') returning id`,
		[tenantId, clientId]
	);
	if (cents !== null)
		await addLine(superuser, { tenant: tenantId, id, client: clientId }, 1, cents, category);
	return id;
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

async function session(account: Account) {
	const client = await withContext(await connectAs('app'), account.context);
	const { rows } = await client.query<{ pid: number }>('select pg_backend_pid() as pid');
	return { client, pid: rows[0]!.pid };
}

function blockedBehind(pid: number) {
	return expect
		.poll(async () => {
			const { rows } = await superuser.query(
				'select cardinality(pg_blocking_pids($1)) > 0 as waits',
				[pid]
			);
			return rows[0].waits;
		})
		.toBe(true);
}

async function lastSeq(tenantId: string) {
	const { rows } = await superuser.query(
		'select last_seq from app.invoice_counters where tenant_id = $1',
		[tenantId]
	);
	return rows[0]?.last_seq as number | undefined;
}

describe('one draft issued from two connections', () => {
	it('lets one through and spends exactly one number', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);
		const clientId = await seedClient(tenant);
		const draftId = await seedDraft(tenant, clientId);
		const first = await session(hr);
		const second = await session(hr);

		await first.client.query('begin');
		await first.client.query('select app.issue_invoice($1)', [draftId]);
		const late = second.client.query('select app.issue_invoice($1)', [draftId]).then(
			() => 'issued',
			(error: { code: string }) => error.code
		);
		await blockedBehind(second.pid);
		await first.client.query('commit');

		expect(await late).toBe('ZT003');
		expect(await lastSeq(tenant)).toBe(1);
		const next = await issue(hr, await seedDraft(tenant, clientId));
		expect(next.number_seq).toBe(2);
	});
});

describe('a new position racing the issue', () => {
	let tenant: string;
	let hr: Account;
	let clientId: string;

	beforeAll(async () => {
		tenant = await createTenant();
		hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);
		clientId = await seedClient(tenant);
	});

	it('waits for the open insert and bills the position with it', async () => {
		const draftId = await seedDraft(tenant, clientId);
		const writer = await session(hr);
		const issuer = await session(hr);

		await writer.client.query('begin');
		await addLine(writer.client, { tenant, id: draftId, client: clientId }, 2, 1000);
		const issued = issuer.client.query('select net_cents from app.issue_invoice($1)', [draftId]);
		await blockedBehind(issuer.pid);
		await writer.client.query('commit');

		expect((await issued).rows[0].net_cents).toBe('6000');
	});

	it('refuses the position that queued behind the issue', async () => {
		const draftId = await seedDraft(tenant, clientId);
		const issuer = await session(hr);
		const writer = await session(hr);

		await issuer.client.query('begin');
		await issuer.client.query('select app.issue_invoice($1)', [draftId]);
		const added = addLine(writer.client, { tenant, id: draftId, client: clientId }, 2, 1000).then(
			() => 'added',
			(error: { code: string }) => error.code
		);
		await blockedBehind(writer.pid);
		await issuer.client.query('commit');

		expect(await added).toBe('ZT002');
		const { rows } = await superuser.query(
			'select count(*)::int as n from app.invoice_lines where invoice_id = $1',
			[draftId]
		);
		expect(rows[0].n).toBe(1);
	});
});

describe('billing lock on a project entry', () => {
	let tenant: string;
	let hr: Account;
	let worker: Person;
	let clientId: string;
	let projectId: string;
	let day = 1;

	beforeAll(async () => {
		tenant = await createTenant();
		hr = await createUser(tenant, { role: 'hr' });
		worker = await createPerson(tenant);
		await seedBillingProfile(tenant);
		clientId = await seedClient(tenant);
		projectId = await seedProject(tenant, clientId);
	});

	async function book() {
		const date = `2026-03-${String(day++).padStart(2, '0')}`;
		await superuser.query('begin');
		await superuser.query(`select set_config('app.role', 'hr', true)`);
		const id = await insertId(
			superuser,
			`insert into app.project_entries (tenant_id, employee_id, project_id, started_at, ended_at, note, source)
			 values ($1, $2, $3, $4::date + time '09:00', $4::date + time '10:00', 'Belege', 'manual') returning id`,
			[tenant, worker.employeeId, projectId, date]
		);
		await superuser.query('commit');
		return id;
	}

	async function link(entryId: string, invoiceId: string | null) {
		await withContext(app, hr.context);
		return app.query('update app.project_entries set invoice_id = $1 where id = $2', [
			invoiceId,
			entryId
		]);
	}

	async function onIssuedInvoice() {
		const entryId = await book();
		const draftId = await seedDraft(tenant, clientId);
		await link(entryId, draftId);
		await issue(hr, draftId);
		return { entryId, invoiceId: draftId };
	}

	it('keeps an entry on an issued or paid invoice, for hr and the superuser alike', async () => {
		const { entryId, invoiceId } = await onIssuedInvoice();
		const otherDraft = await seedDraft(tenant, clientId);

		await expect(link(entryId, null)).rejects.toMatchObject({ code: 'ZT004' });
		await expect(link(entryId, otherDraft)).rejects.toMatchObject({ code: 'ZT004' });

		await superuser.query('begin');
		await superuser.query(`select set_config('app.role', 'hr', true)`);
		const freed = await superuser
			.query('update app.project_entries set invoice_id = null where id = $1', [entryId])
			.catch((error) => error);
		await superuser.query('rollback');
		expect(freed).toMatchObject({ code: 'ZT004' });

		await app.query(
			`update app.invoices set status = 'paid', paid_on = current_date where id = $1`,
			[invoiceId]
		);
		await expect(link(entryId, null)).rejects.toMatchObject({ code: 'ZT004' });
	});

	it('lets an entry go from a draft and from a cancelled invoice', async () => {
		const entryId = await book();
		const draftId = await seedDraft(tenant, clientId);
		await link(entryId, draftId);
		expect((await link(entryId, null)).rowCount).toBe(1);

		const { entryId: billed, invoiceId } = await onIssuedInvoice();
		await cancel(hr, invoiceId);
		await superuser.query('begin');
		await superuser.query('set local session_replication_role = replica');
		await superuser.query('update app.project_entries set invoice_id = $1 where id = $2', [
			invoiceId,
			billed
		]);
		await superuser.query('commit');
		expect((await link(billed, null)).rowCount).toBe(1);
	});

	it('puts an entry only onto an open draft of its own client', async () => {
		const { invoiceId } = await onIssuedInvoice();
		const entryId = await book();
		const strangerDraft = await seedDraft(tenant, await seedClient(tenant));

		await expect(link(entryId, invoiceId)).rejects.toMatchObject({ code: 'ZT003' });
		await expect(link(entryId, strangerDraft)).rejects.toMatchObject({ code: '23514' });
		expect((await link(entryId, await seedDraft(tenant, clientId))).rowCount).toBe(1);
	});
});

describe('addresses on the issued invoice', () => {
	it('refuses without a complete seller address', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant, noAddress);
		const clientId = await seedClient(tenant);
		await expect(issue(hr, await seedDraft(tenant, clientId))).rejects.toMatchObject({
			code: 'ZT006'
		});

		await superuser.query(
			`update app.billing_profiles set street = ' ', postal_code = '48143', city = 'Münster' where tenant_id = $1`,
			[tenant]
		);
		await expect(issue(hr, await seedDraft(tenant, clientId))).rejects.toMatchObject({
			code: 'ZT006'
		});
		expect(await lastSeq(tenant)).toBeUndefined();
	});

	it('wants the buyer address above 250 euros gross and for reverse charge', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);
		const clientId = await seedClient(tenant, noAddress);

		const atLimit = await issue(hr, await seedDraft(tenant, clientId, 21008));
		expect(atLimit.gross_cents).toBe('25000');
		await expect(issue(hr, await seedDraft(tenant, clientId, 21009))).rejects.toMatchObject({
			code: 'ZT006'
		});
		await expect(
			issue(hr, await seedDraft(tenant, clientId, 1000, 'reverse_charge'))
		).rejects.toMatchObject({
			code: 'ZT006'
		});
	});

	it('checks no address on a cancellation, it keeps the one of the original', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);

		const small = await issue(
			hr,
			await seedDraft(tenant, await seedClient(tenant, noAddress), 10000)
		);
		expect((await cancel(hr, small.id)).gross_cents).toBe('-11900');

		const large = await issue(hr, await seedDraft(tenant, await seedClient(tenant), 30000));
		await superuser.query('begin');
		await superuser.query('set local session_replication_role = replica');
		await superuser.query(`update app.invoices set buyer = buyer - 'street' where id = $1`, [
			large.id
		]);
		await superuser.query('commit');
		expect((await cancel(hr, large.id)).buyer).not.toHaveProperty('street');
	});
});

describe('the cancellation document', () => {
	it('takes seller and buyer from the original, without its texts', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);
		const clientId = await seedClient(tenant);
		const draftId = await seedDraft(tenant, clientId);
		await superuser.query(
			`update app.invoices set locale = 'en', format = 'zugferd', payment_terms_days = 30,
				intro_text = 'Vielen Dank für den Auftrag.', closing_text = 'Zahlbar ohne Abzug.'
			  where id = $1`,
			[draftId]
		);
		const original = await issue(hr, draftId);

		await superuser.query(
			`update app.clients set street = 'Neue Straße 9', city = 'Köln' where id = $1`,
			[clientId]
		);
		await superuser.query(
			`update app.billing_profiles set city = 'Dortmund' where tenant_id = $1`,
			[tenant]
		);
		const cancellation = await cancel(hr, original.id);

		expect(cancellation).toMatchObject({
			seller: original.seller,
			buyer: original.buyer,
			intro_text: null,
			closing_text: null,
			locale: 'en',
			format: 'zugferd',
			tax_profile: 'regular',
			payment_terms_days: 30
		});
		expect(cancellation.buyer.street).toBe('Hafenweg 3');
	});
});

describe('line amounts', () => {
	let tenant: string;
	let hr: Account;
	let clientId: string;
	let projectId: string;

	beforeAll(async () => {
		tenant = await createTenant();
		hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);
		clientId = await seedClient(tenant);
		projectId = await seedProject(tenant, clientId);
	});

	const timeLine = (invoiceId: string, minutes: number, price: number, net: number) =>
		superuser.query(
			`insert into app.invoice_lines (
				tenant_id, invoice_id, client_id, position, kind, project_id, description, minutes,
				unit_price_cents, net_cents, tax_category, tax_rate_bp
			 ) values ($1, $2, $3, 1, 'time', $4, 'Jahresabschluss', $5, $6, $7, 'standard', 1900)`,
			[tenant, invoiceId, clientId, projectId, minutes, price, net]
		);

	const itemLine = (invoiceId: string, quantity: number, price: number, net: number) =>
		superuser.query(
			`insert into app.invoice_lines (
				tenant_id, invoice_id, client_id, position, kind, description, quantity_milli, unit,
				unit_price_cents, net_cents, tax_category, tax_rate_bp
			 ) values ($1, $2, $3, 2, 'item', 'Anfahrt', $4, 'LS', $5, $6, 'standard', 1900)`,
			[tenant, invoiceId, clientId, quantity, price, net]
		);

	it('takes only the net amount that follows from quantity and price, rounded half away from zero', async () => {
		const draftId = await seedDraft(tenant, clientId, null);
		await expect(timeLine(draftId, 1, 30, 0)).rejects.toMatchObject({ code: '23514' });
		await expect(itemLine(draftId, 1500, 333, 499)).rejects.toMatchObject({ code: '23514' });
		await timeLine(draftId, 1, 30, 1);
		await itemLine(draftId, 1500, 333, 500);

		const original = await issue(hr, draftId);
		expect(original.gross_cents).toBe('596');
		const cancellation = await cancel(hr, original.id);
		expect(cancellation.gross_cents).toBe('-596');
		const { rows } = await superuser.query(
			'select minutes, quantity_milli, net_cents from app.invoice_lines where invoice_id = $1 order by position',
			[cancellation.id]
		);
		expect(rows).toEqual([
			{ minutes: -1, quantity_milli: null, net_cents: '-1' },
			{ minutes: null, quantity_milli: '-1500', net_cents: '-500' }
		]);
	});

	it('keeps quantity, minutes and price within bounds', async () => {
		const draftId = await seedDraft(tenant, clientId, null);
		await expect(itemLine(draftId, 1_000_000_001, 1, 1_000_000)).rejects.toMatchObject({
			code: '23514'
		});
		await expect(itemLine(draftId, 1000, 1_000_000_001, 1_000_000_001)).rejects.toMatchObject({
			code: '23514'
		});
		await expect(timeLine(draftId, 10_000_001, 60, 10_000_001)).rejects.toMatchObject({
			code: '23514'
		});
		expect((await itemLine(draftId, 1000, -500, -500)).rowCount).toBe(1);
	});
});

describe('total of an invoice', () => {
	it('issues nothing without a positive gross amount', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);
		const clientId = await seedClient(tenant);

		await expect(issue(hr, await seedDraft(tenant, clientId, null))).rejects.toMatchObject({
			code: 'ZT003'
		});
		const credit = await seedDraft(tenant, clientId, 5000);
		await addLine(superuser, { tenant, id: credit, client: clientId }, 2, -6000);
		await expect(issue(hr, credit)).rejects.toMatchObject({ code: 'ZT003' });
		expect(await lastSeq(tenant)).toBeUndefined();
	});
});

describe('bookings on one invoice', () => {
	it('issues 5000 and refuses the 5001st without spending a number', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		const worker = await createPerson(tenant);
		await seedBillingProfile(tenant);
		const clientId = await seedClient(tenant);
		const projectId = await seedProject(tenant, clientId);
		const draftId = await seedDraft(tenant, clientId);

		await superuser.query('begin');
		await superuser.query(`select set_config('app.role', 'hr', true)`);
		await superuser.query(
			`with booked as (
			   insert into app.project_entries (tenant_id, employee_id, project_id, started_at, ended_at, note, source)
			   select $1, $2, $3,
			          timestamptz '2026-02-02 06:00+01' + (gs / 600) * interval '1 day' + (gs % 600) * interval '1 minute',
			          timestamptz '2026-02-02 06:01+01' + (gs / 600) * interval '1 day' + (gs % 600) * interval '1 minute',
			          'Beleg', 'manual'
			     from generate_series(0, 5000) gs
			   returning id
			 )
			 insert into app.invoice_line_entries (tenant_id, invoice_id, line_id, entry_id)
			 select $1, $4, (select id from app.invoice_lines where invoice_id = $4), id from booked`,
			[tenant, worker.employeeId, projectId, draftId]
		);
		await superuser.query('commit');

		await expect(issue(hr, draftId)).rejects.toMatchObject({ code: '23514' });
		expect(await lastSeq(tenant)).toBeUndefined();

		await superuser.query(
			`delete from app.invoice_line_entries
			  where entry_id = (select entry_id from app.invoice_line_entries where invoice_id = $1 limit 1)`,
			[draftId]
		);
		expect((await issue(hr, draftId)).number_seq).toBe(1);
	});
});

describe('payment and cancellation columns', () => {
	let tenant: string;
	let hr: Account;
	let clientId: string;

	beforeAll(async () => {
		tenant = await createTenant();
		hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);
		clientId = await seedClient(tenant);
	});

	const issued = async () => (await issue(hr, await seedDraft(tenant, clientId))).id as string;
	const berlinToday = `(now() at time zone 'Europe/Berlin')::date`;

	it('leaves the cancellation details to app.invoice_cancel', async () => {
		const invoiceId = await issued();
		await withContext(app, hr.context);
		for (const change of [
			`cancel_reason = 'Nachträglich eingetragen'`,
			`cancelled_at = now()`,
			`cancelled_by = '${hr.userId}'`
		]) {
			await expect(
				app.query(`update app.invoices set ${change} where id = $1`, [invoiceId])
			).rejects.toMatchObject({
				code: '42501'
			});
		}
		await expect(
			superuser.query(
				`update app.invoices set cancel_reason = 'Nachträglich eingetragen' where id = $1`,
				[invoiceId]
			)
		).rejects.toMatchObject({ code: 'ZT002' });
	});

	it('takes no payment date from the future and moves it only with the status', async () => {
		const invoiceId = await issued();
		await withContext(app, hr.context);
		const pay = (date: string) =>
			app.query(`update app.invoices set status = 'paid', paid_on = ${date} where id = $1`, [
				invoiceId
			]);

		await expect(pay(`${berlinToday} + 1`)).rejects.toMatchObject({ code: '23514' });
		expect((await pay(berlinToday)).rowCount).toBe(1);
		await expect(
			app.query('update app.invoices set paid_on = paid_on - 1 where id = $1', [invoiceId])
		).rejects.toMatchObject({ code: 'ZT002' });
	});

	it('never marks a cancellation as paid', async () => {
		const cancellation = await cancel(hr, await issued());
		await expect(
			app.query(`update app.invoices set status = 'paid', paid_on = ${berlinToday} where id = $1`, [
				cancellation.id
			])
		).rejects.toMatchObject({ code: '23514' });
	});
});

describe('tenant retention', () => {
	it('holds a live tenant even when the deleting role sees none of its invoices', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);
		await issue(hr, await seedDraft(tenant, await seedClient(tenant)));

		await superuser.query('begin');
		await superuser.query('alter table app.tenants disable trigger tenants_guard_delete');
		await superuser.query('grant delete on app.tenants to zeit_app');
		await superuser.query(
			`create policy "blind delete" on app.tenants for delete to zeit_app using (true)`
		);
		await superuser.query('set local role zeit_app');
		await superuser.query(
			`select set_config('app.tenant_id', $1, true), set_config('app.role', 'employee', true),
				set_config('zeit.purge_tenant', $1, true)`,
			[tenant]
		);
		const seen = await superuser.query('select count(*)::int as n from app.invoices');
		const refused = await superuser
			.query('delete from app.tenants where id = $1', [tenant])
			.catch((error) => error);
		await superuser.query('rollback');

		expect(seen.rows[0].n).toBe(0);
		expect(refused).toMatchObject({
			code: 'ZT002',
			message: expect.stringContaining('retention period')
		});
	});
});

describe('invoice counter in the trail', () => {
	it('logs every step of the counter, for admins and the issuer only', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		const colleague = await createUser(tenant, { role: 'hr' });
		const admin = await createUser(tenant, { role: 'admin' });
		await seedBillingProfile(tenant);
		const clientId = await seedClient(tenant);
		await issue(hr, await seedDraft(tenant, clientId));
		await issue(hr, await seedDraft(tenant, clientId));

		const { rows } = await superuser.query(
			`select action, diff, actor_user_id from audit.log
			  where tenant_id = $1 and table_name = 'invoice_counters' order by id`,
			[tenant]
		);
		expect(rows).toEqual([
			expect.objectContaining({
				action: 'insert',
				diff: expect.objectContaining({ last_seq: [null, 1] })
			}),
			{ action: 'update', diff: { last_seq: [1, 2] }, actor_user_id: hr.userId }
		]);

		const trail = `select count(*)::int as n from audit.log where table_name = 'invoice_counters'`;
		await withContext(app, colleague.context);
		expect((await app.query(trail)).rows[0].n).toBe(0);
		await withContext(app, admin.context);
		expect((await app.query(trail)).rows[0].n).toBe(2);
		await expect(app.query('update app.invoice_counters set last_seq = 1')).rejects.toMatchObject({
			code: '42501'
		});
	});
});

describe('stored documents', () => {
	it('come in through app.store_invoice_document only', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		const worker = await createPerson(tenant);
		await seedBillingProfile(tenant);
		const clientId = await seedClient(tenant);
		const draftId = await seedDraft(tenant, clientId);
		const invoiceId = (await issue(hr, await seedDraft(tenant, clientId))).id as string;
		const pdf = Buffer.from('%PDF-1.4 Musterrechnung');
		const store = (id: string, content = pdf) =>
			app.query(`select app.store_invoice_document($1, 'pdf', $2) as id`, [id, content]);

		await expect(
			app.query(
				`insert into app.invoice_documents (tenant_id, invoice_id, format, content, sha256)
				 values ($1, $2, 'pdf', $3, sha256($3))`,
				[tenant, invoiceId, pdf]
			)
		).rejects.toMatchObject({ code: '42501' });
		await expect(store(draftId)).rejects.toMatchObject({ code: 'ZT003' });

		const stored = (await store(invoiceId)).rows[0].id;
		const { rows } = await superuser.query(
			'select tenant_id, sha256, created_by from app.invoice_documents where id = $1',
			[stored]
		);
		expect(rows[0]).toEqual({
			tenant_id: tenant,
			sha256: createHash('sha256').update(pdf).digest(),
			created_by: hr.userId
		});
		expect((await store(invoiceId, Buffer.from('%PDF-1.4 zweite Fassung'))).rows[0].id).toBeNull();

		await withContext(app, worker.context);
		await expect(store(invoiceId)).rejects.toMatchObject({ code: '42501' });

		await withContext(app, (await createUser(await createTenant(), { role: 'admin' })).context);
		await expect(store(invoiceId)).rejects.toMatchObject({ code: 'ZT003' });
	});

	it('take only the formats of the invoice, each starting with its own bytes', async () => {
		const tenant = await createTenant();
		const hr = await createUser(tenant, { role: 'hr' });
		await seedBillingProfile(tenant);
		const clientId = await seedClient(tenant);
		const issuedAs = async (format: string) => {
			const draftId = await seedDraft(tenant, clientId);
			await superuser.query('update app.invoices set format = $2 where id = $1', [draftId, format]);
			return (await issue(hr, draftId)).id as string;
		};
		const invoices = {
			pdf: await issuedAs('pdf'),
			zugferd: await issuedAs('zugferd'),
			xrechnung: await issuedAs('xrechnung'),
			bom: await issuedAs('xrechnung')
		};
		const pdf = Buffer.from('%PDF-1.7 Musterrechnung');
		const xml = Buffer.from('<?xml version="1.0" encoding="utf-8"?><rsm:CrossIndustryInvoice/>');
		const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), xml]);

		const outcomes = [];
		for (const [invoice, format, content] of [
			['pdf', 'pdf', xml],
			['pdf', 'zugferd', pdf],
			['pdf', 'xrechnung_cii', xml],
			['pdf', 'time_report_pdf', pdf],
			['pdf', 'pdf', pdf],
			['zugferd', 'pdf', pdf],
			['zugferd', 'zugferd', Buffer.from('%PDF')],
			['zugferd', 'zugferd', pdf],
			['xrechnung', 'zugferd', pdf],
			['xrechnung', 'xrechnung_cii', pdf],
			['xrechnung', 'xrechnung_cii', xml],
			['xrechnung', 'pdf', pdf],
			['bom', 'pdf', bom],
			['bom', 'xrechnung_cii', bom]
		] as const) {
			const stored = app
				.query('select app.store_invoice_document($1, $2, $3)', [
					invoices[invoice],
					format,
					content
				])
				.then(
					() => 'stored',
					(error: { code: string }) => error.code
				);
			outcomes.push(`${invoice} ${format}: ${await stored}`);
		}

		expect(outcomes).toEqual([
			'pdf pdf: ZT003',
			'pdf zugferd: ZT003',
			'pdf xrechnung_cii: ZT003',
			'pdf time_report_pdf: ZT003',
			'pdf pdf: stored',
			'zugferd pdf: ZT003',
			'zugferd zugferd: ZT003',
			'zugferd zugferd: stored',
			'xrechnung zugferd: ZT003',
			'xrechnung xrechnung_cii: ZT003',
			'xrechnung xrechnung_cii: stored',
			'xrechnung pdf: stored',
			'bom pdf: ZT003',
			'bom xrechnung_cii: stored'
		]);
		const { rows } = await superuser.query(
			`select count(*)::int as n from app.invoice_documents where tenant_id = $1`,
			[tenant]
		);
		expect(rows[0].n).toBe(5);
	});
});
