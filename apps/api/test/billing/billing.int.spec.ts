import { billingProfileSchema, revenueSchema, unbilledSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RenderJob } from '../../src/documents/worker';
import { expectContract, startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { seedBillingProfile, seedClient, seedDraft } from '../helpers/invoices';
import { createPerson, createTenant } from '../helpers/pg';

vi.mock('../../src/documents/worker', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../src/documents/worker')>();
	const { withRenderSlot } = await import('../../src/documents/render-limit');
	return {
		...original,
		renderInWorker: vi.fn((job: RenderJob) => withRenderSlot(() => original.renderJob(job)))
	};
});

let api: Api;
let tenant: string;
let hr: Desk;
let admin: Desk;
let year: number;

const sellerBody = {
	legalName: 'Erika Muster',
	street: 'Musterweg 1',
	postalCode: '48143',
	city: 'Münster',
	taxNumber: '133/8150/8159',
	vatId: null,
	previousYearRevenueCents: null,
	iban: null,
	bic: null,
	bankName: null,
	contactName: null,
	contactEmail: null,
	contactPhone: null,
	registerCourt: null,
	registerNumber: null
};

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	hr = await signedIn(api, (await createPerson(tenant, { role: 'hr' })).userId);
	admin = await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId, { reauth: true });
	const { rows } = await api.superuser.query(
		`select extract(year from now() at time zone 'Europe/Berlin')::int as y`
	);
	year = rows[0].y;
});

afterAll(() => api.app.close());

async function confirmedAdmin(tenantId: string) {
	return signedIn(api, (await createPerson(tenantId, { role: 'admin' })).userId, { reauth: true });
}

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
			iban: 'DE84000000009876543210',
			bic: null,
			bankName: null,
			contactName: null,
			contactEmail: null,
			contactPhone: null,
			registerCourt: null,
			registerNumber: null
		});
		expect(first.status).toBe(200);
		expect(first.body.iban).toBe('DE84000000009876543210');

		// one mail per admin in the tenant, admin and stranger both qualify
		const mailed = api.mails.filter((mail) => /Bankverbindung/.test(mail.subject));
		expect(mailed.length).toBeGreaterThanOrEqual(2);
		expect(new Set(mailed.map((mail) => mail.to)).size).toBe(mailed.length);
		expect(mailed.every((mail) => mail.text.includes('3210'))).toBe(true);
		expect(mailed.every((mail) => !mail.text.includes('DE84000000009876543210'))).toBe(true);

		const { rows } = await api.superuser.query(
			`select diff from audit.log where source = 'app' and action = 'billing_profile.updated'
			 and tenant_id = $1 order by id desc limit 1`,
			[tenant]
		);
		expect(rows[0].diff.changedFields).toContain('legalName');
		expect(JSON.stringify(rows[0].diff)).not.toContain('DE84000000009876543210');

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
			iban: 'DE79000000001234567890',
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
		expect(rows[0].diff.iban).toEqual(['3210', '7890']);
		const asText = JSON.stringify(rows[0].diff);
		expect(asText).not.toContain('DE84000000009876543210');
		expect(asText).not.toContain('DE79000000001234567890');
	});

	it('wants a fresh confirmation before a change and keeps the profile as it was', async () => {
		const before = (await admin.get('/billing/profile')).body;
		const unconfirmed = await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId);
		const answer = await unconfirmed.patch('/billing/profile', {
			legalName: 'X',
			iban: 'DE84000000009876543210'
		});
		expect(answer.status).toBe(403);
		expect(answer.body.code).toBe('REAUTH_REQUIRED');
		expect((await admin.get('/billing/profile')).body).toEqual(before);
	});

	it('allows ten changes an hour per admin, then answers 429 with Retry-After', async () => {
		const office = await createTenant();
		const first = await confirmedAdmin(office);
		const second = await confirmedAdmin(office);

		for (let i = 0; i < 10; i++) {
			expect((await first.patch('/billing/profile', sellerBody)).status).toBe(200);
		}
		const limited = await first.patch('/billing/profile', sellerBody);
		expect(limited.status).toBe(429);
		expect(limited.body.code).toBe('RATE_LIMITED');
		const retryAfter = Number(limited.headers['retry-after']);
		expect(retryAfter).toBeGreaterThan(0);
		expect(retryAfter).toBeLessThanOrEqual(3600);

		expect((await second.patch('/billing/profile', sellerBody)).status).toBe(200);
	});
});

describe('billing profile in a sandbox (X-02)', () => {
	it('switches the tax profile and refuses every other change with 403', async () => {
		const sandbox = await createTenant({ kind: 'sandbox' });
		await seedBillingProfile(api.superuser, sandbox);
		const owner = await confirmedAdmin(sandbox);
		const unchanged = (await owner.get('/billing/profile')).body;
		delete unchanged.countryCode;

		const switched = await owner.patch('/billing/profile', {
			...unchanged,
			taxProfile: 'small_business',
			previousYearRevenueCents: '2400000'
		});
		expect(switched.status).toBe(200);
		expect(switched.body).toMatchObject({
			taxProfile: 'small_business',
			previousYearRevenueCents: '2400000'
		});

		for (const change of [
			{ iban: 'DE84000000009876543210' },
			{ street: 'Hauptstraße 5', city: 'Köln' },
			{ contactEmail: 'chefin@echt.example.test' },
			{ taxNumber: '201/123/45678' },
			{ invoicePrefix: 'ECHT' }
		]) {
			const refused = await owner.patch('/billing/profile', {
				...unchanged,
				...change,
				taxProfile: 'small_business',
				previousYearRevenueCents: '2400000'
			});
			expect(refused.status).toBe(403);
			expect(refused.body).toMatchObject({
				code: 'FORBIDDEN',
				details: { fields: Object.keys(change) }
			});
		}
		expect((await owner.get('/billing/profile')).body).toEqual(switched.body);
	});

	it('answers 403 and writes no row when a sandbox seeded without a profile tries to add one', async () => {
		const sandbox = await createTenant({ kind: 'sandbox' });
		const owner = await confirmedAdmin(sandbox);

		const refused = await owner.patch('/billing/profile', {
			...sellerBody,
			taxProfile: 'small_business'
		});
		expect(refused.status).toBe(403);
		expect(refused.body.code).toBe('FORBIDDEN');
		const { rows } = await api.superuser.query(
			'select count(*)::int as profiles from app.billing_profiles where tenant_id = $1',
			[sandbox]
		);
		expect(rows[0].profiles).toBe(0);
	});

	it('leaves a live tenant free to change its seller details', async () => {
		const office = await createTenant();
		await seedBillingProfile(api.superuser, office);
		const owner = await confirmedAdmin(office);
		const changed = await owner.patch('/billing/profile', {
			...sellerBody,
			street: 'Hauptstraße 5'
		});
		expect(changed.status).toBe(200);
		expect(changed.body.street).toBe('Hauptstraße 5');
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

	it('counts a cancelled invoice and its cancellation as zero together', async () => {
		const office = await createTenant();
		await seedBillingProfile(api.superuser, office);
		const owner = await confirmedAdmin(office);
		const clientId = await seedClient(api.superuser, office);
		const issue = async () => {
			const draftId = await seedDraft(api.superuser, office, clientId);
			const answer = await owner.post(`/invoices/${draftId}/issue`, { format: 'pdf' });
			expect(answer.status).toBe(200);
			return answer.body;
		};
		const issuedCents = async () =>
			(await owner.get(`/billing/revenue?year=${year}`)).body.issuedThisYearCents;

		const kept = await issue();
		const cancelled = await issue();
		expect(await issuedCents()).toBe('11900');

		const storno = await owner.post(`/invoices/${cancelled.id}/cancel`, {
			reason: 'Doppelt ausgestellt, Kunde informiert'
		});
		expect(storno.status).toBe(200);
		expect(storno.body.totals.grossCents).toBe('-5950');
		expect(await issuedCents()).toBe(kept.totals.grossCents);
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
