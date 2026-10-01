import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedBillingProfile } from '../helpers/invoices';
import { connectAs, createTenant, createUser, type Account, withContext } from '../helpers/pg';

let superuser: pg.Client;
let app: pg.Client;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
});

const sellerChanges = [
	{ field: 'iban', set: { iban: 'DE84000000009876543210' } },
	{ field: 'address', set: { street: 'Hauptstraße 5', postal_code: '50667', city: 'Köln' } },
	{ field: 'contact', set: { contact_name: 'Chefin', contact_email: 'chefin@echt.example.test' } },
	{ field: 'prefix', set: { invoice_prefix: 'ECHT' } },
	{ field: 'tax number', set: { tax_number: '201/123/45678' } }
];

function errorCode(attempt: Promise<unknown>) {
	return attempt.then(
		() => 'applied',
		(error: { code: string }) => error.code
	);
}

function change(tenant: string, set: Record<string, unknown>) {
	const columns = Object.keys(set).map((column, i) => `${column} = $${i + 2}`);
	return app.query(`update app.billing_profiles set ${columns.join(', ')} where tenant_id = $1`, [
		tenant,
		...Object.values(set)
	]);
}

function addProfile(tenant: string) {
	return app.query(
		`insert into app.billing_profiles (tenant_id, legal_name, street, postal_code, city)
		 values ($1, 'Kanzlei Echt GmbH', 'Hauptstraße 5', '50667', 'Köln')`,
		[tenant]
	);
}

async function profileOf(tenant: string) {
	const { rows } = await superuser.query(
		`select legal_name, street, postal_code, city, tax_number, iban, contact_name, contact_email,
		        invoice_prefix, tax_profile::text, previous_year_revenue_cents::text
		   from app.billing_profiles where tenant_id = $1`,
		[tenant]
	);
	return rows[0];
}

async function office(kind: 'live' | 'sandbox') {
	const tenant = await createTenant({ kind });
	const admin = await createUser(tenant, { role: 'admin' });
	return { tenant, admin };
}

describe('billing profile of a sandbox, written by zeit_app', () => {
	let tenant: string;
	let admin: Account;
	let seeded: Record<string, unknown>;

	beforeAll(async () => {
		({ tenant, admin } = await office('sandbox'));
		await seedBillingProfile(superuser, tenant);
		seeded = await profileOf(tenant);
	});

	it.each(sellerChanges)('refuses a change of the $field', async ({ set }) => {
		await withContext(app, admin.context);
		expect(await errorCode(change(tenant, set))).toBe('ZT002');
		expect(await profileOf(tenant)).toEqual(seeded);
	});

	it('refuses the same change sent as an upsert, the way the api writes', async () => {
		await withContext(app, admin.context);
		expect(
			await errorCode(
				app.query(
					`insert into app.billing_profiles (tenant_id, legal_name) values ($1, 'Kanzlei Echt GmbH')
					 on conflict (tenant_id) do update set legal_name = excluded.legal_name`,
					[tenant]
				)
			)
		).toBe('ZT002');
		expect(await profileOf(tenant)).toEqual(seeded);
	});

	it('switches tax profile and previous year revenue, also through the upsert', async () => {
		await withContext(app, admin.context);
		expect(
			await errorCode(
				change(tenant, { tax_profile: 'small_business', previous_year_revenue_cents: 2_400_000 })
			)
		).toBe('applied');
		expect(await profileOf(tenant)).toEqual({
			...seeded,
			tax_profile: 'small_business',
			previous_year_revenue_cents: '2400000'
		});

		expect(
			await errorCode(
				app.query(
					`insert into app.billing_profiles (tenant_id, legal_name, tax_profile)
					 values ($1, $2, 'regular')
					 on conflict (tenant_id) do update set tax_profile = excluded.tax_profile`,
					[tenant, seeded.legal_name]
				)
			)
		).toBe('applied');
		expect((await profileOf(tenant)).tax_profile).toBe('regular');
	});

	it('refuses a profile row for a sandbox that was seeded without one', async () => {
		const bare = await office('sandbox');
		await withContext(app, bare.admin.context);
		expect(await errorCode(addProfile(bare.tenant))).toBe('42501');
		expect(await profileOf(bare.tenant)).toBeUndefined();
	});
});

describe('billing profile of a live tenant, written by zeit_app', () => {
	it.each(sellerChanges)('takes a change of the $field', async ({ set }) => {
		const { tenant, admin } = await office('live');
		await seedBillingProfile(superuser, tenant);
		await withContext(app, admin.context);
		expect(await errorCode(change(tenant, set))).toBe('applied');
		expect(await profileOf(tenant)).toMatchObject(set);
	});

	it('takes a first profile row', async () => {
		const { tenant, admin } = await office('live');
		await withContext(app, admin.context);
		expect(await errorCode(addProfile(tenant))).toBe('applied');
		expect(await profileOf(tenant)).toMatchObject({ legal_name: 'Kanzlei Echt GmbH' });
	});
});
