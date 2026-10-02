import { generateDemo } from '@zeit/demo-data';
import { EU_COUNTRY_CODES, taxTreatment } from '@zeit/rules';
import type pg from 'pg';
import { Temporal } from 'temporal-polyfill';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedBillingProfile, seedClient } from '../helpers/invoices';
import {
	connectAs,
	createTenant,
	createUser,
	insertId,
	type Account,
	type Context,
	withContext
} from '../helpers/pg';

let superuser: pg.Client;
let app: pg.Client;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
});

const REASON = 'Steuerfrei nach § 4 Nr. 21 UStG';

const sellerKeys = [
	'bankName',
	'bic',
	'city',
	'contactEmail',
	'contactName',
	'contactPhone',
	'countryCode',
	'iban',
	'legalName',
	'postalCode',
	'registerCourt',
	'registerNumber',
	'street',
	'taxNumber',
	'vatId'
];

function errorCode(attempt: Promise<unknown>) {
	return attempt.then(
		() => 'applied',
		(error: { code: string }) => error.code
	);
}

function draftWith(
	tenantId: string,
	clientId: string,
	treatment: string | null,
	profile = 'regular'
) {
	return insertId(
		superuser,
		`insert into app.invoices (tenant_id, client_id, service_from, service_to, payment_terms_days, format,
			tax_profile, tax_treatment)
		 values ($1, $2, '2026-02-01', '2026-02-28', 14, 'pdf', $3, $4) returning id`,
		[tenantId, clientId, profile, treatment]
	);
}

function addLine(
	db: pg.Client,
	draft: { tenant: string; id: string; client: string },
	position: number,
	category: string,
	reason: string | null = category === 'exempt' ? REASON : null
) {
	return db.query(
		`insert into app.invoice_lines (
			tenant_id, invoice_id, client_id, position, kind, description, quantity_milli, unit,
			unit_price_cents, net_cents, tax_category, tax_rate_bp, exemption_reason
		 ) values ($1, $2, $3, $4, 'item', 'Beratung', 1000, 'HUR', 5000, 5000, $5, $6, $7)`,
		[
			draft.tenant,
			draft.id,
			draft.client,
			position,
			category,
			{ standard: 1900, reduced: 700 }[category] ?? 0,
			reason
		]
	);
}

async function office() {
	const tenant = await createTenant();
	const hr = await createUser(tenant, { role: 'hr' });
	await seedBillingProfile(superuser, tenant);
	return { tenant, hr, client: await seedClient(superuser, tenant) };
}

async function sellerOf(invoiceId: string) {
	const { rows } = await superuser.query('select seller from app.invoices where id = $1', [
		invoiceId
	]);
	return rows[0].seller as Record<string, unknown>;
}

describe('tax treatment of an invoice', () => {
	let tenant: string;
	let client: string;
	let hr: Account;

	beforeAll(async () => {
		({ tenant, client, hr } = await office());
	});

	it.each([
		{
			treatment: 'standard',
			fits: ['standard', 'reduced', 'exempt'],
			misfits: ['reverse_charge', 'outside_scope', 'small_business']
		},
		{
			treatment: 'reverse_charge',
			fits: ['reverse_charge'],
			misfits: ['standard', 'reduced', 'exempt', 'outside_scope']
		},
		{
			treatment: 'outside_scope',
			fits: ['outside_scope'],
			misfits: ['standard', 'reduced', 'exempt', 'reverse_charge']
		}
	])(
		'takes on a $treatment invoice only the lines that fit it',
		async ({ treatment, fits, misfits }) => {
			const draft = { tenant, client, id: await draftWith(tenant, client, treatment) };
			const outcomes = [];
			for (const [i, category] of [...fits, ...misfits].entries()) {
				outcomes.push([category, await errorCode(addLine(superuser, draft, i + 1, category))]);
			}
			expect(outcomes).toEqual([
				...fits.map((category) => [category, 'applied']),
				...misfits.map((category) => [category, '23514'])
			]);
		}
	);

	it('takes only small_business lines on a small-business invoice', async () => {
		const draft = {
			tenant,
			client,
			id: await draftWith(tenant, client, 'small_business', 'small_business')
		};
		expect(await errorCode(addLine(superuser, draft, 1, 'small_business'))).toBe('applied');
		expect(await errorCode(addLine(superuser, draft, 2, 'standard'))).toBe('23514');
		expect(await errorCode(addLine(superuser, draft, 3, 'exempt'))).toBe('23514');
	});

	it('leaves a draft without treatment to the profile check alone', async () => {
		const draft = { tenant, client, id: await draftWith(tenant, client, null) };
		expect(await errorCode(addLine(superuser, draft, 1, 'standard'))).toBe('applied');
		expect(await errorCode(addLine(superuser, draft, 2, 'reverse_charge'))).toBe('applied');
		expect(await errorCode(addLine(superuser, draft, 3, 'small_business'))).toBe('23514');
	});

	it('refuses a treatment that is none or contradicts the tax profile', async () => {
		const outcomes = [];
		for (const [profile, treatment] of [
			['regular', 'reduced'],
			['regular', 'exempt'],
			['regular', 'small_business'],
			['small_business', 'standard'],
			['small_business', 'reverse_charge']
		]) {
			outcomes.push(await errorCode(draftWith(tenant, client, treatment!, profile)));
		}
		expect(outcomes).toEqual(Array(5).fill('23514'));
	});

	it('refuses to issue a draft whose lines stopped fitting when hr set the treatment later', async () => {
		const own = await office();
		const draft = {
			tenant: own.tenant,
			client: own.client,
			id: await draftWith(own.tenant, own.client, null)
		};
		await addLine(superuser, draft, 1, 'standard');
		await withContext(app, own.hr.context);
		await app.query(`update app.invoices set tax_treatment = 'reverse_charge' where id = $1`, [
			draft.id
		]);

		expect(await errorCode(app.query('select app.issue_invoice($1)', [draft.id]))).toBe('23514');
		const { rows } = await superuser.query(
			`select i.status::text, (select count(*)::int from app.invoice_counters c where c.tenant_id = i.tenant_id) as counters
			   from app.invoices i where i.id = $1`,
			[draft.id]
		);
		expect(rows[0]).toEqual({ status: 'draft', counters: 0 });

		await app.query(`update app.invoices set tax_treatment = 'standard' where id = $1`, [draft.id]);
		expect(await errorCode(app.query('select app.issue_invoice($1)', [draft.id]))).toBe('applied');
	});

	it.each([
		{
			treatment: 'reverse_charge',
			country: 'NL',
			vatId: 'NL123456789B01',
			change: 'vat_id = null'
		},
		{
			treatment: 'reverse_charge',
			country: 'NL',
			vatId: 'NL123456789B01',
			change: `country_code = 'DE'`
		},
		{
			treatment: 'reverse_charge',
			country: 'NL',
			vatId: 'NL123456789B01',
			change: 'is_business = false'
		},
		{ treatment: 'outside_scope', country: 'US', vatId: null, change: `country_code = 'DE'` }
	])(
		'refuses to issue a $treatment draft after $change on its client, without a number',
		async ({ treatment, country, vatId, change }) => {
			const own = await office();
			await superuser.query(
				`update app.clients set country_code = $2, is_business = true, vat_id = $3,
					street = 'Keizersgracht 1', postal_code = '1015', city = 'Amsterdam'
				  where id = $1`,
				[own.client, country, vatId]
			);
			const draft = {
				tenant: own.tenant,
				client: own.client,
				id: await draftWith(own.tenant, own.client, treatment)
			};
			const untouched = { ...draft, id: await draftWith(own.tenant, own.client, treatment) };
			await addLine(superuser, draft, 1, treatment);
			await addLine(superuser, untouched, 1, treatment);
			await withContext(app, own.hr.context);
			expect(await errorCode(app.query('select app.issue_invoice($1)', [untouched.id]))).toBe(
				'applied'
			);

			await superuser.query(`update app.clients set ${change} where id = $1`, [own.client]);
			expect(await errorCode(app.query('select app.issue_invoice($1)', [draft.id]))).toBe('ZT003');
			const { rows } = await superuser.query(
				`select i.status::text, (select last_seq from app.invoice_counters c where c.tenant_id = i.tenant_id) as seq
				   from app.invoices i where i.id = $1`,
				[draft.id]
			);
			expect(rows[0]).toEqual({ status: 'draft', seq: 1 });
		}
	);

	it('hands treatment and exemption reasons on to the cancellation', async () => {
		const draft = { tenant, client, id: await draftWith(tenant, client, 'standard') };
		await addLine(superuser, draft, 1, 'standard');
		await addLine(superuser, draft, 2, 'exempt');
		await withContext(app, hr.context);
		await app.query('select app.issue_invoice($1)', [draft.id]);

		const { rows } = await app.query(
			`select id, tax_treatment::text from app.invoice_cancel($1, 'Falscher Empfänger angegeben')`,
			[draft.id]
		);
		expect(rows[0].tax_treatment).toBe('standard');
		const lines = await superuser.query(
			`select position, tax_category::text, exemption_reason
			   from app.invoice_lines where invoice_id = $1 order by position`,
			[rows[0].id]
		);
		expect(lines.rows).toEqual([
			{ position: 1, tax_category: 'standard', exemption_reason: null },
			{ position: 2, tax_category: 'exempt', exemption_reason: REASON }
		]);
	});
});

describe('expected tax treatment in sql', () => {
	const clients = [
		{ countryCode: 'DE', isBusiness: true, vatId: 'DE123456789' },
		{ countryCode: 'DE', isBusiness: false, vatId: null },
		{ countryCode: 'NL', isBusiness: true, vatId: 'NL123456789B01' },
		{ countryCode: 'NL', isBusiness: true, vatId: null },
		{ countryCode: 'FR', isBusiness: false, vatId: 'FR12345678901' },
		{ countryCode: 'AT', isBusiness: false, vatId: null },
		{ countryCode: 'CH', isBusiness: true, vatId: 'CHE-123.456.789 MWST' },
		{ countryCode: 'US', isBusiness: true, vatId: null },
		{ countryCode: 'GB', isBusiness: false, vatId: null }
	];
	const cases = (['regular', 'small_business'] as const).flatMap((taxProfile) =>
		clients.map((client) => ({ taxProfile, ...client }))
	);

	it.each(cases)(
		'matches the rules for $taxProfile and $countryCode, business $isBusiness, vat id $vatId',
		async ({ taxProfile, ...client }) => {
			const { rows } = await superuser.query(
				'select app.expected_tax_treatment($1, $2, $3, $4)::text as treatment',
				[taxProfile, client.countryCode, client.isBusiness, client.vatId]
			);
			expect(rows[0].treatment).toBe(taxTreatment({ taxProfile }, client));
		}
	);

	it('knows the same member states as the rules', async () => {
		const codes = [...EU_COUNTRY_CODES, 'DE', 'CH', 'GB', 'NO', 'US'];
		const { rows } = await superuser.query(
			'select code, app.eu_member(code) as member from unnest($1::text[]) code',
			[codes]
		);
		expect(rows.map((row) => row.member)).toEqual(
			codes.map((code) => EU_COUNTRY_CODES.includes(code))
		);
	});

	it('refuses to issue a standard draft whose client turned into an EU business with vat id', async () => {
		const own = await office();
		const draft = {
			tenant: own.tenant,
			client: own.client,
			id: await draftWith(own.tenant, own.client, 'standard')
		};
		await addLine(superuser, draft, 1, 'standard');
		await superuser.query(
			`update app.clients set country_code = 'NL', is_business = true, vat_id = 'NL123456789B01' where id = $1`,
			[own.client]
		);

		await withContext(app, own.hr.context);
		expect(await errorCode(app.query('select app.issue_invoice($1)', [draft.id]))).toBe('ZT003');
		const { rows } = await superuser.query('select status::text from app.invoices where id = $1', [
			draft.id
		]);
		expect(rows[0].status).toBe('draft');
	});
});

describe('basis of an invoice being issued', () => {
	it('holds client and billing profile until the issuing transaction ends', async () => {
		const own = await office();
		const draft = await draftWith(own.tenant, own.client, 'standard');
		const other = await connectAs('superuser');
		await other.query(`set lock_timeout = '200ms'`);
		const attempt = (statement: string, id: string) => errorCode(other.query(statement, [id]));

		await withContext(app, own.hr.context);
		await app.query('begin');
		await app.query('select app.hold_invoice_basis($1)', [draft]);
		const blocked = [
			await attempt(`update app.clients set name = 'Neu GmbH' where id = $1`, own.client),
			await attempt(
				`update app.billing_profiles set legal_name = 'Neu GmbH' where tenant_id = $1`,
				own.tenant
			)
		];
		await app.query('rollback');
		await other.end();

		expect(blocked).toEqual(['55P03', '55P03']);
	});

	it('is held by hr and admins only', async () => {
		const own = await office();
		const draft = await draftWith(own.tenant, own.client, 'standard');
		const employee = await createUser(own.tenant, { role: 'employee' });
		await withContext(app, employee.context);
		expect(await errorCode(app.query('select app.hold_invoice_basis($1)', [draft]))).toBe('42501');
	});
});

describe('exemption reason of a line', () => {
	let tenant: string;
	let client: string;
	let hr: Account;

	beforeAll(async () => {
		({ tenant, client, hr } = await office());
	});

	it('is there exactly on exempt lines, never blank and at most 200 characters', async () => {
		const draft = { tenant, client, id: await draftWith(tenant, client, 'standard') };
		const outcomes = [
			await errorCode(addLine(superuser, draft, 1, 'exempt', null)),
			await errorCode(addLine(superuser, draft, 2, 'standard', REASON)),
			await errorCode(addLine(superuser, draft, 3, 'reduced', REASON)),
			await errorCode(addLine(superuser, draft, 4, 'exempt', '   ')),
			await errorCode(addLine(superuser, draft, 5, 'exempt', 'x'.repeat(201))),
			await errorCode(addLine(superuser, draft, 6, 'exempt', 'x'.repeat(200))),
			await errorCode(addLine(superuser, draft, 7, 'standard', null))
		];
		expect(outcomes).toEqual(['23514', '23514', '23514', '23514', '23514', 'applied', 'applied']);
	});

	it('stays editable for hr on a draft and fixed once the invoice is issued', async () => {
		const draft = { tenant, client, id: await draftWith(tenant, client, 'standard') };
		await addLine(superuser, draft, 1, 'exempt');
		await withContext(app, hr.context);
		const edit = (reason: string) =>
			errorCode(
				app.query('update app.invoice_lines set exemption_reason = $2 where invoice_id = $1', [
					draft.id,
					reason
				])
			);

		expect(await edit('Steuerfrei nach § 4 Nr. 14 UStG')).toBe('applied');
		await app.query('select app.issue_invoice($1)', [draft.id]);
		expect(await edit(REASON)).toBe('ZT002');
	});
});

describe('seller snapshot', () => {
	it('freezes the seller of a live invoice with exactly the keys of the api contract', async () => {
		const { tenant, client, hr } = await office();
		const draft = { tenant, client, id: await draftWith(tenant, client, 'standard') };
		await addLine(superuser, draft, 1, 'standard');
		await withContext(app, hr.context);
		await app.query('select app.issue_invoice($1)', [draft.id]);

		expect(Object.keys(await sellerOf(draft.id)).sort()).toEqual(sellerKeys);
	});

	it('gives a sandbox without its seeded profile the fixed specimen seller, contact included', async () => {
		const tenant = await createTenant({ kind: 'sandbox' });
		const hr = await createUser(tenant, { role: 'hr' });
		const client = await seedClient(superuser, tenant);
		const draft = { tenant, client, id: await draftWith(tenant, client, 'standard') };
		await addLine(superuser, draft, 1, 'standard');
		await withContext(app, hr.context);
		await app.query('select app.issue_invoice($1)', [draft.id]);

		const seller = await sellerOf(draft.id);
		expect(Object.keys(seller).sort()).toEqual(sellerKeys);
		expect(seller).toMatchObject({
			legalName: 'Musterbetrieb Mira Beispiel',
			vatId: 'DE000000000',
			contactEmail: expect.stringMatching(/\.example\.test$/),
			contactPhone: expect.any(String)
		});
	});

	it('drops the taxProfile key an invoice issued before kept, when it gets cancelled', async () => {
		const { tenant, client, hr } = await office();
		const draft = { tenant, client, id: await draftWith(tenant, client, 'standard') };
		await addLine(superuser, draft, 1, 'standard');
		await withContext(app, hr.context);
		await app.query('select app.issue_invoice($1)', [draft.id]);
		await superuser.query('begin');
		await superuser.query('set local session_replication_role = replica');
		await superuser.query(
			`update app.invoices set seller = seller || '{"taxProfile": "regular"}' where id = $1`,
			[draft.id]
		);
		await superuser.query('commit');

		const { rows } = await app.query(
			`select id from app.invoice_cancel($1, 'Leistung wurde nicht erbracht')`,
			[draft.id]
		);
		expect(Object.keys(await sellerOf(rows[0].id)).sort()).toEqual(sellerKeys);
	});
});

describe('seller of an invoice issued in a seeded sandbox', () => {
	const today = Temporal.Now.plainDateISO('Europe/Berlin');
	const plan = generateDemo({ today, seed: 1300 });
	const hr = plan.users.find((user) => user.role === 'hr')!;
	const desk: Context = {
		tenantId: plan.tenant.id,
		userId: hr.id,
		role: 'hr',
		employeeId: hr.employeeId
	};

	beforeAll(async () => {
		const seeder = await connectAs('app');
		await seeder.query(`select set_config('app.demo_mode', 'true', false)`);
		await withContext(seeder, { tenantId: plan.tenant.id, role: 'admin' });
		await seeder.query(`select ops.sandbox_seed($1::jsonb, 'de')`, [JSON.stringify(plan)]);
	});

	it('is the made-up billing profile of the world, as on the seeded invoices', async () => {
		const draft = plan.invoices.find((invoice) => invoice.status === 'draft')!;
		await withContext(app, desk);
		const { rows } = await app.query('select number, seller from app.issue_invoice($1)', [
			draft.id
		]);

		expect(rows[0].number).toBe(`MUSTER-${today.year}-0003`);
		expect(rows[0].seller).toEqual(
			plan.invoices.find((invoice) => invoice.number !== null)!.seller
		);
		expect(rows[0].seller).toMatchObject({ legalName: plan.billingProfile.legalName });
	});

	it('stays the seller of the profile after the visitor switched to small business', async () => {
		await withContext(app, { tenantId: plan.tenant.id, role: 'admin' });
		await app.query(
			`update app.billing_profiles set tax_profile = 'small_business', previous_year_revenue_cents = 2400000
			  where tenant_id = $1`,
			[plan.tenant.id]
		);
		const client = plan.clients[0]!.id;
		const draft = {
			tenant: plan.tenant.id,
			client,
			id: await draftWith(plan.tenant.id, client, 'small_business', 'small_business')
		};
		await addLine(superuser, draft, 1, 'small_business');
		await withContext(app, desk);
		const { rows } = await app.query('select seller from app.issue_invoice($1)', [draft.id]);

		expect(rows[0].seller).toEqual(
			plan.invoices.find((invoice) => invoice.number !== null)!.seller
		);
	});
});
