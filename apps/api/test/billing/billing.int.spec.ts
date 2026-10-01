import { billingProfileSchema, revenueSchema, unbilledSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectContract, startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { createPerson, createTenant } from '../helpers/pg';

let api: Api;
let tenant: string;
let hr: Desk;
let admin: Desk;

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	hr = await signedIn(api, (await createPerson(tenant, { role: 'hr' })).userId);
	admin = await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId, { reauth: true });
});

afterAll(() => api.app.close());

describe('billing profile', () => {
	it('answers with the column defaults before a profile row exists', async () => {
		const answer = await hr.get('/billing/profile');
		expect(answer.status).toBe(200);
		expectContract(billingProfileSchema, answer.body);
		expect(answer.body).toMatchObject({ legalName: '', taxProfile: 'regular', paymentTermsDays: 14 });
	});

	it('upserts the profile, mails every admin on an iban change and protects the field', async () => {
		// a second admin in the same tenant, so the mail loop has more than one recipient to prove
		await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId, { reauth: true });

		const first = await admin.patch('/billing/profile', {
			legalName: 'Mira Beispiel',
			street: null,
			postalCode: null,
			city: null,
			taxNumber: null,
			vatId: null,
			previousYearRevenueCents: null,
			iban: 'DE89370400440532013000',
			bic: null,
			bankName: null,
			contactName: null,
			contactEmail: null,
			contactPhone: null,
			registerCourt: null,
			registerNumber: null
		});
		expect(first.status).toBe(200);
		expect(first.body.iban).toBe('DE89370400440532013000');

		// one mail per admin in the tenant, admin and stranger both qualify
		const mailed = api.mails.filter((mail) => /Bankverbindung/.test(mail.subject));
		expect(mailed.length).toBeGreaterThanOrEqual(2);
		expect(new Set(mailed.map((mail) => mail.to)).size).toBe(mailed.length);
		expect(mailed.every((mail) => mail.text.includes('3000'))).toBe(true);
		expect(mailed.every((mail) => !mail.text.includes('DE89370400440532013000'))).toBe(true);

		const { rows } = await api.superuser.query(
			`select diff from audit.log where source = 'app' and action = 'billing_profile.updated'
			 and tenant_id = $1 order by id desc limit 1`,
			[tenant]
		);
		expect(rows[0].diff.changedFields).toContain('legalName');
		expect(JSON.stringify(rows[0].diff)).not.toContain('DE89370400440532013000');

		const hrTried = await hr.patch('/billing/profile', { legalName: 'Andere GmbH' });
		expect(hrTried.status).toBe(403);
	});

	it('redacts the iban in the database trigger audit row too, not just the app-level one', async () => {
		const changed = await admin.patch('/billing/profile', {
			legalName: 'Mira Beispiel',
			street: null,
			postalCode: null,
			city: null,
			taxNumber: null,
			vatId: null,
			previousYearRevenueCents: null,
			iban: 'DE02120300000000202051',
			bic: null,
			bankName: null,
			contactName: null,
			contactEmail: null,
			contactPhone: null,
			registerCourt: null,
			registerNumber: null
		});
		expect(changed.status).toBe(200);

		const { rows } = await api.superuser.query(
			`select diff from audit.log where source = 'trigger' and table_name = 'billing_profiles'
			 and tenant_id = $1 order by id desc limit 1`,
			[tenant]
		);
		expect(rows[0].diff.iban).toEqual(['3000', '2051']);
		const asText = JSON.stringify(rows[0].diff);
		expect(asText).not.toContain('DE89370400440532013000');
		expect(asText).not.toContain('DE02120300000000202051');
	});

	it('wants a fresh confirmation before a change', async () => {
		const unconfirmed = await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId);
		const answer = await unconfirmed.patch('/billing/profile', { legalName: 'X' });
		expect(answer.status).toBe(403);
		expect(answer.body.code).toBe('REAUTH_REQUIRED');
	});
});

describe('unbilled and revenue', () => {
	it('adds up unbilled time per client and checks the small-business limit', async () => {
		const client = (await hr.post('/clients', { name: 'Vorschau KG' })).body;
		const project = (await hr.post('/projects', { clientId: client.id, name: 'Beratung' })).body;
		await hr.post('/rates', { clientId: client.id, validFrom: '2026-01-01', rateCents: '10000' });
		const worker = await createPerson(tenant);
		await (
			await signedIn(api, worker.userId)
		).post('/project-entries', {
			projectId: project.id,
			startedAt: '2026-09-08T09:00:00+02:00',
			endedAt: '2026-09-08T10:00:00+02:00',
			note: 'Beratung'
		});

		const unbilled = await hr.get('/billing/unbilled');
		expect(unbilled.status).toBe(200);
		expectContract(unbilledSchema, unbilled.body);
		const row = unbilled.body.find((entry: { clientId: string }) => entry.clientId === client.id);
		expect(row).toMatchObject({ minutes: 60, amountCents: '10000' });

		const revenue = await hr.get('/billing/revenue?year=2026');
		expect(revenue.status).toBe(200);
		expectContract(revenueSchema, revenue.body);
		expect(revenue.body.smallBusiness.state).toEqual(expect.any(String));
	});
});

describe('another tenant', () => {
	it('never sees the other tenant profile, only its own defaults', async () => {
		const other = await createTenant();
		const stranger = await signedIn(api, (await createPerson(other, { role: 'hr' })).userId);

		const profile = await stranger.get('/billing/profile');
		expect(profile.status).toBe(200);
		expectContract(billingProfileSchema, profile.body);
		// the top-level admin already set this tenant's legalName to 'Mira Beispiel' above
		expect(profile.body.legalName).toBe('');
	});
});
