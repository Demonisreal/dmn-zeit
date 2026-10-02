import { randomUUID } from 'node:crypto';
import type request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { pdfParse } from '../../src/documents/pdf-parse.fixture';
import { MAX_CONCURRENT, MAX_QUEUED, withRenderSlot } from '../../src/documents/render-limit';
import { renderInWorker, type RenderJob } from '../../src/documents/worker';
import { DocumentsService } from '../../src/documents/documents.service';
import { MAX_ENTRIES } from '../../src/invoices/invoices.service';
import { InvoicesStore } from '../../src/invoices/invoices.store';
import { startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { seedBillingProfile, seedClient, seedDraft } from '../helpers/invoices';
import { connectAs, createPerson, createTenant, withContext } from '../helpers/pg';

vi.mock('../../src/documents/worker', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../src/documents/worker')>();
	const { withRenderSlot: inSlot } = await import('../../src/documents/render-limit');
	return {
		...original,
		renderInWorker: vi.fn((job: RenderJob) => inSlot(() => original.renderJob(job)))
	};
});

const SPECIMEN = 'Musterrechnung – keine Rechnung im Sinne des § 14 UStG';

let api: Api;
let year: number;

beforeAll(async () => {
	api = await startApi();
	const { rows } = await api.superuser.query(
		`select extract(year from now() at time zone 'Europe/Berlin')::int as y`
	);
	year = rows[0].y;
});

afterAll(() => api.app.close());

async function confirmedAdmin(tenant: string) {
	return signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId, { reauth: true });
}

async function office(kind: 'live' | 'sandbox' = 'live') {
	const tenant = await createTenant({ kind });
	await seedBillingProfile(api.superuser, tenant);
	return { tenant, admin: await confirmedAdmin(tenant) };
}

async function bookedDraft(tenant: string, desk: Desk, day: string, clientFields = {}) {
	const client = (await desk.post('/clients', { name: 'Korn KG', ...clientFields })).body;
	const project = (await desk.post('/projects', { clientId: client.id, name: 'Website' })).body;
	await desk.post('/rates', { clientId: client.id, validFrom: '2026-01-01', rateCents: '6000' });
	const workerDesk = await signedIn(api, (await createPerson(tenant)).userId);
	const entry = await workerDesk.post('/project-entries', {
		projectId: project.id,
		startedAt: `${day}T09:00:00+02:00`,
		endedAt: `${day}T11:00:00+02:00`,
		note: 'Umsetzung'
	});
	expect(entry.status).toBe(201);
	const draft = await desk.post('/invoices/drafts', { clientId: client.id, from: day, to: day });
	expect(draft.status).toBe(201);
	return { client, project, entry: entry.body, draft: draft.body, workerDesk };
}

async function issuedInvoice(tenant: string, admin: Desk, clientId: string) {
	const draftId = await seedDraft(api.superuser, tenant, clientId);
	const answer = await admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' });
	expect(answer.status).toBe(200);
	return answer.body;
}

async function counter(tenant: string) {
	const { rows } = await api.superuser.query(
		'select last_seq from app.invoice_counters where tenant_id = $1',
		[tenant]
	);
	return rows[0]?.last_seq ?? null;
}

async function statusOf(invoiceId: string) {
	const { rows } = await api.superuser.query(
		'select status, specimen from app.invoices where id = $1',
		[invoiceId]
	);
	return rows[0];
}

async function cancellationsOf(invoiceId: string) {
	const { rows } = await api.superuser.query(
		'select id from app.invoices where refers_to_id = $1',
		[invoiceId]
	);
	return rows.length;
}

async function pdfText(answer: request.Response) {
	expect(answer.status).toBe(200);
	expect(answer.headers['content-type']).toContain('application/pdf');
	return (await pdfParse(answer.body)).text.replace(/\s+/g, ' ');
}

function deferred() {
	let release!: () => void;
	const done = new Promise<void>((resolve) => (release = resolve));
	return { release, run: () => withRenderSlot(() => done) };
}

async function fullRenderQueue() {
	const jobs = Array.from({ length: MAX_CONCURRENT + MAX_QUEUED }, () => deferred());
	const pending = jobs.map((job) => job.run());
	await Promise.resolve();
	return async () => {
		for (const job of jobs) job.release();
		await Promise.all(pending);
	};
}

async function storedFormats(invoiceId: string) {
	const { rows } = await api.superuser.query<{ format: string }>(
		'select format from app.invoice_documents where invoice_id = $1 order by format',
		[invoiceId]
	);
	return rows.map((row) => row.format);
}

function waitingForLocks(count: number) {
	return expect
		.poll(async () => {
			const { rows } = await api.superuser.query(
				`select count(*)::int as n from pg_stat_activity
				  where datname = current_database() and wait_event_type = 'Lock'`
			);
			return rows[0].n;
		})
		.toBe(count);
}

const freeLine = {
	description: 'Anfahrt',
	quantityMilli: '1000',
	unit: 'LS',
	unitPriceCents: '4000',
	taxCategory: 'standard'
};

describe('numbering over http', () => {
	it('hands out 2 to 21 once each to twenty parallel issues, after a first one already went out', async () => {
		const { tenant, admin } = await office();
		const clientId = await seedClient(api.superuser, tenant);
		const drafts: string[] = [];
		for (let i = 0; i < 21; i++) drafts.push(await seedDraft(api.superuser, tenant, clientId));

		vi.mocked(renderInWorker).mockImplementation(async (job) => {
			if (job.kind === 'invoice' && job.invoice.status === 'draft') {
				return [{ format: 'pdf', content: Buffer.from('%PDF-') }];
			}
			throw new Error('numbering only, the document stays pending');
		});
		try {
			const first = await admin.post(`/invoices/${drafts[0]}/issue`, { format: 'pdf' });
			expect(first.body.number).toBe(`RE-${year}-0001`);

			const parallel = await Promise.all(
				drafts
					.slice(1)
					.map((draftId) => admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' }))
			);
			expect(parallel.map((answer) => answer.status)).toEqual(Array(20).fill(200));
			expect(parallel.map((answer) => answer.body.number).sort()).toEqual(
				Array.from({ length: 20 }, (_, i) => `RE-${year}-${String(i + 2).padStart(4, '0')}`)
			);
			expect(parallel.map((answer) => answer.body.numberSeq).sort((a, b) => a - b)).toEqual(
				Array.from({ length: 20 }, (_, i) => i + 2)
			);
			expect(await counter(tenant)).toBe(21);
		} finally {
			vi.mocked(renderInWorker).mockReset();
		}
	});
});

describe('one draft issued twice at once', () => {
	it('answers 200 once and 409 INVALID_STATE once, with one number spent', async () => {
		const { tenant, admin } = await office();
		const draftId = await seedDraft(api.superuser, tenant, await seedClient(api.superuser, tenant));
		const holder = await connectAs('superuser');
		await holder.query('begin');
		await holder.query('select id from app.invoices where id = $1 for update', [draftId]);

		const both = Promise.all(
			[1, 2].map(() =>
				admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' }).then((answer) => answer)
			)
		);
		await waitingForLocks(2);
		await holder.query('rollback');

		const answers = await both;
		expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
		expect(answers.find((answer) => answer.status === 409)!.body.code).toBe('INVALID_STATE');
		expect(await counter(tenant)).toBe(1);
	});
});

describe('an issued invoice', () => {
	it('turns every draft change away with 409 INVALID_STATE', async () => {
		const { tenant, admin } = await office();
		const original = await issuedInvoice(tenant, admin, await seedClient(api.superuser, tenant));
		const lineId = original.lines[0].id;

		const answers = [
			await admin.patch(`/invoices/${original.id}`, { paymentTermsDays: 30 }),
			await admin.post(`/invoices/${original.id}/refresh`),
			await admin.post(`/invoices/${original.id}/lines`, freeLine),
			await admin.patch(`/invoices/${original.id}/lines/${lineId}`, { description: 'Nachtrag' }),
			await admin.delete(`/invoices/${original.id}/lines/${lineId}`),
			await admin.delete(`/invoices/${original.id}`)
		];
		expect(answers.map((answer) => [answer.status, answer.body.code])).toEqual(
			Array(6).fill([409, 'INVALID_STATE'])
		);
		expect((await admin.get(`/invoices/${original.id}`)).body.lines).toHaveLength(1);
	});

	it('refuses a position that waited for the issue to commit', async () => {
		const { tenant, admin } = await office();
		const issuer = await createPerson(tenant, { role: 'admin' });
		const draftId = await seedDraft(api.superuser, tenant, await seedClient(api.superuser, tenant));
		const db = await withContext(await connectAs('app'), issuer.context);
		await db.query('begin');
		await db.query('select app.issue_invoice($1)', [draftId]);

		const added = admin.post(`/invoices/${draftId}/lines`, freeLine).then((answer) => answer);
		await waitingForLocks(1);
		await db.query('commit');

		const answer = await added;
		expect(answer.status).toBe(409);
		expect(answer.body.code).toBe('INVALID_STATE');
		expect((await admin.get(`/invoices/${draftId}`)).body.lines).toHaveLength(1);
	});

	it('has no preview', async () => {
		const { tenant, admin } = await office();
		const original = await issuedInvoice(tenant, admin, await seedClient(api.superuser, tenant));
		const preview = await admin.get(`/invoices/${original.id}/preview.pdf`);
		expect(preview.status).toBe(409);
		expect(preview.body.code).toBe('INVALID_STATE');
	});
});

describe('payment', () => {
	afterEach(() => vi.restoreAllMocks());

	async function berlinDays() {
		const { rows } = await api.superuser.query(
			`select (now() at time zone 'Europe/Berlin')::date::text as today,
			        ((now() at time zone 'Europe/Berlin')::date + 1)::text as tomorrow`
		);
		return rows[0] as { today: string; tomorrow: string };
	}

	it('takes no date after today in Berlin', async () => {
		const { tenant, admin } = await office();
		const original = await issuedInvoice(tenant, admin, await seedClient(api.superuser, tenant));
		const { today, tomorrow } = await berlinDays();

		const early = await admin.post(`/invoices/${original.id}/paid`, { paidOn: tomorrow });
		expect(early.status).toBe(400);
		expect(early.body.details).toEqual([
			{ field: 'paidOn', code: 'custom', message: 'invoice.paidOnFuture' }
		]);
		expect((await statusOf(original.id)).status).toBe('issued');

		const paid = await admin.post(`/invoices/${original.id}/paid`, { paidOn: today });
		expect(paid.status).toBe(200);
		expect(paid.body.paidOn).toBe(today);
	});

	it('never marks a cancellation paid', async () => {
		const { tenant, admin } = await office();
		const original = await issuedInvoice(tenant, admin, await seedClient(api.superuser, tenant));
		const cancellation = await admin.post(`/invoices/${original.id}/cancel`, {
			reason: 'Leistung wurde nicht erbracht'
		});
		const { today } = await berlinDays();

		const paid = await admin.post(`/invoices/${cancellation.body.id}/paid`, { paidOn: today });
		expect(paid.status).toBe(409);
		expect(paid.body.code).toBe('INVALID_STATE');
		expect((await statusOf(cancellation.body.id)).status).toBe('issued');
	});

	it('answers 409 when the status moved away before the update landed', async () => {
		const { tenant, admin } = await office();
		const original = await issuedInvoice(tenant, admin, await seedClient(api.superuser, tenant));
		const { today } = await berlinDays();
		const store = api.app.get(InvoicesStore);

		vi.spyOn(store, 'setPaid').mockResolvedValueOnce(undefined);
		const paid = await admin.post(`/invoices/${original.id}/paid`, { paidOn: today });
		expect([paid.status, paid.body.code]).toEqual([409, 'INVALID_STATE']);

		await admin.post(`/invoices/${original.id}/paid`, { paidOn: today });
		vi.spyOn(store, 'setUnpaid').mockResolvedValueOnce(undefined);
		const unpaid = await admin.post(`/invoices/${original.id}/unpaid`);
		expect([unpaid.status, unpaid.body.code]).toEqual([409, 'INVALID_STATE']);
	});
});

describe('a failed issue', () => {
	afterEach(() => vi.restoreAllMocks());

	it('uses up no number when a blocker stops it', async () => {
		const { tenant, admin } = await office();
		const clientId = await seedClient(api.superuser, tenant, 'Brandt B.V.');
		await api.superuser.query(
			`update app.clients set country_code = 'NL', is_business = true, vat_id = 'NL123456789B01' where id = $1`,
			[clientId]
		);
		const draftId = await seedDraft(api.superuser, tenant, clientId);

		const refused = await admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' });
		expect(refused.status).toBe(409);
		expect(refused.body.details.blockers).toContain('vat_id_missing');
		expect((await statusOf(draftId)).status).toBe('draft');
		expect(await counter(tenant)).toBeNull();
	});

	it('uses up no number while a position carries the wrong tax rate', async () => {
		const { tenant, admin } = await office();
		const draftId = await seedDraft(api.superuser, tenant, await seedClient(api.superuser, tenant));
		await api.superuser.query(
			'update app.invoice_lines set tax_rate_bp = 1600 where invoice_id = $1',
			[draftId]
		);

		const refused = await admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' });
		expect(refused.status).toBe(409);
		expect(refused.body.details.blockers).toEqual(['tax_rate_mismatch']);
		expect(await counter(tenant)).toBeNull();
	});

	it('refuses a draft that changed while its pages were counted', async () => {
		const { tenant, admin } = await office();
		const draftId = await seedDraft(api.superuser, tenant, await seedClient(api.superuser, tenant));
		const documents = api.app.get(DocumentsService);
		const render = documents.renderInvoice.bind(documents);
		vi.spyOn(documents, 'renderInvoice').mockImplementationOnce(async (draft) => {
			expect((await admin.post(`/invoices/${draftId}/lines`, freeLine)).status).toBe(201);
			return render(draft);
		});

		const refused = await admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' });
		expect([refused.status, refused.body.code]).toEqual([409, 'INVALID_STATE']);
		expect((await statusOf(draftId)).status).toBe('draft');
		expect(await counter(tenant)).toBeNull();

		const issued = await admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' });
		expect(issued.body.lines).toHaveLength(2);
		expect(issued.body.number).toBe(`RE-${year}-0001`);
	});

	it('hands the number back when the service fails after numbering', async () => {
		const { tenant, admin } = await office();
		const draftId = await seedDraft(api.superuser, tenant, await seedClient(api.superuser, tenant));
		vi.spyOn(api.app.get(InvoicesStore), 'logEvent').mockRejectedValueOnce(
			new Error('audit log unavailable')
		);

		const failed = await admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' });
		expect(failed.status).toBe(500);
		expect((await statusOf(draftId)).status).toBe('draft');
		expect(await counter(tenant)).toBeNull();

		const retried = await admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' });
		expect(retried.body.number).toBe(`RE-${year}-0001`);
	});

	it('hands the cancellation number back when the cancellation fails after numbering', async () => {
		const { tenant, admin } = await office();
		const original = await issuedInvoice(tenant, admin, await seedClient(api.superuser, tenant));
		vi.spyOn(api.app.get(InvoicesStore), 'logEvent').mockRejectedValueOnce(
			new Error('audit log unavailable')
		);

		const failed = await admin.post(`/invoices/${original.id}/cancel`, {
			reason: 'Falsche Anschrift beim Kunden'
		});
		expect(failed.status).toBe(500);
		expect((await statusOf(original.id)).status).toBe('issued');
		expect(await cancellationsOf(original.id)).toBe(0);
		expect(await counter(tenant)).toBe(1);

		const retried = await admin.post(`/invoices/${original.id}/cancel`, {
			reason: 'Falsche Anschrift beim Kunden'
		});
		expect(retried.body.number).toBe(`RE-${year}-0002`);
	});
});

describe('cancellation chain', () => {
	it('takes one cancellation per invoice, none of a cancellation, numbered from the same counter', async () => {
		const { tenant, admin } = await office();
		const original = await issuedInvoice(tenant, admin, await seedClient(api.superuser, tenant));

		const cancellation = await admin.post(`/invoices/${original.id}/cancel`, {
			reason: 'Falscher Leistungszeitraum'
		});
		expect(cancellation.status).toBe(200);
		expect(cancellation.body.number).toBe(`RE-${year}-0002`);

		const again = await admin.post(`/invoices/${original.id}/cancel`, {
			reason: 'Noch einmal stornieren'
		});
		expect(again.status).toBe(409);
		expect(again.body.code).toBe('INVALID_STATE');

		const ofCancellation = await admin.post(`/invoices/${cancellation.body.id}/cancel`, {
			reason: 'Storno der Stornorechnung'
		});
		expect(ofCancellation.status).toBe(409);
		expect(ofCancellation.body.code).toBe('INVALID_STATE');

		expect(await cancellationsOf(original.id)).toBe(1);
		expect(await counter(tenant)).toBe(2);
	});
});

describe('billing lock over http', () => {
	it('answers 409 INVOICED on time of an issued invoice and frees it with the cancellation', async () => {
		const { tenant, admin } = await office();
		const { draft, entry, workerDesk } = await bookedDraft(tenant, admin, '2026-09-16');
		expect((await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' })).status).toBe(200);

		const changed = await workerDesk.patch(`/project-entries/${entry.id}`, { note: 'Nachtrag' });
		expect(changed.status).toBe(409);
		expect(changed.body.code).toBe('INVOICED');
		const voided = await workerDesk.post(`/project-entries/${entry.id}/void`);
		expect(voided.status).toBe(409);
		expect(voided.body.code).toBe('INVOICED');

		await admin.post(`/invoices/${draft.id}/cancel`, { reason: 'Kunde storniert den Auftrag' });
		const freed = await workerDesk.patch(`/project-entries/${entry.id}`, { note: 'Nachtrag' });
		expect(freed.status).toBe(200);
		expect(freed.body.note).toBe('Nachtrag');
	});
});

describe('tax treatment of a draft whose client changed', () => {
	const abroad = {
		countryCode: 'NL',
		vatId: 'NL123456789B01',
		street: 'Keizersgracht 1',
		postalCode: '1015 CJ',
		city: 'Amsterdam'
	};

	async function movedToGermany(day: string) {
		const { tenant, admin } = await office();
		await api.superuser.query(
			`update app.billing_profiles set vat_id = 'DE123456789' where tenant_id = $1`,
			[tenant]
		);
		const booked = await bookedDraft(tenant, admin, day, abroad);
		expect(booked.draft.lines.map((line: { taxCategory: string }) => line.taxCategory)).toEqual([
			'reverse_charge'
		]);
		expect(booked.draft.blockers).toEqual([]);
		const moved = await admin.patch(`/clients/${booked.client.id}`, {
			countryCode: 'DE',
			vatId: null
		});
		expect(moved.status).toBe(200);
		return { tenant, admin, draft: booked.draft };
	}

	it('refuses the reverse-charge issue once the client is German and numbers nothing', async () => {
		const { tenant, admin, draft } = await movedToGermany('2026-09-24');
		expect((await admin.get(`/invoices/${draft.id}`)).body.blockers).toContain(
			'tax_treatment_stale'
		);

		const refused = await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });
		expect(refused.status).toBe(409);
		expect(refused.body.details.blockers).toEqual(['tax_treatment_stale']);
		expect((await statusOf(draft.id)).status).toBe('draft');
		expect(await counter(tenant)).toBeNull();
	});

	it('takes the treatment over again on refresh and issues with German vat', async () => {
		const { admin, draft } = await movedToGermany('2026-09-25');

		const refreshed = await admin.post(`/invoices/${draft.id}/refresh`);
		expect(refreshed.status).toBe(200);
		expect(refreshed.body.blockers).toEqual([]);
		expect(
			refreshed.body.lines.map((line: { taxCategory: string; taxRateBp: number }) => [
				line.taxCategory,
				line.taxRateBp
			])
		).toEqual([['standard', 1900]]);

		const issued = await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });
		expect(issued.status).toBe(200);
		expect(issued.body.buyer.countryCode).toBe('DE');
		expect(issued.body.totals.taxCents).toBe('2280');
	});
});

describe('draft after a change of the tax profile', () => {
	it('names the change, takes the new profile over on refresh and issues', async () => {
		const { tenant, admin } = await office();
		const { draft } = await bookedDraft(tenant, admin, '2026-09-23');
		await api.superuser.query(
			`update app.billing_profiles set tax_profile = 'small_business', previous_year_revenue_cents = 2400000
			  where tenant_id = $1`,
			[tenant]
		);

		const refused = await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });
		expect(refused.status).toBe(409);
		expect(refused.body.details.blockers).toEqual(['tax_profile_changed']);
		expect(await counter(tenant)).toBeNull();

		const refreshed = await admin.post(`/invoices/${draft.id}/refresh`);
		expect(refreshed.status).toBe(200);
		expect(refreshed.body).toMatchObject({
			taxProfile: 'small_business',
			treatment: 'small_business',
			blockers: []
		});
		expect(refreshed.body.lines.map((line: { taxCategory: string }) => line.taxCategory)).toEqual([
			'small_business'
		]);

		const issued = await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });
		expect(issued.status).toBe(200);
		expect(issued.body.totals.taxCents).toBe('0');
	});
});

describe('refresh of a draft', () => {
	it('leaves the time it keeps linked untouched and links only what came in', async () => {
		const { tenant, admin } = await office();
		const { entry, draft, workerDesk, project } = await bookedDraft(tenant, admin, '2026-09-28');
		const xminOf = async (id: string) => {
			const { rows } = await api.superuser.query(
				'select xmin::text, invoice_id from app.project_entries where id = $1',
				[id]
			);
			return rows[0];
		};
		const before = await xminOf(entry.id);
		const added = await workerDesk.post('/project-entries', {
			projectId: project.id,
			startedAt: '2026-09-28T13:00:00+02:00',
			endedAt: '2026-09-28T14:00:00+02:00',
			note: 'Nachtrag'
		});
		expect(added.status).toBe(201);

		expect((await admin.post(`/invoices/${draft.id}/refresh`)).status).toBe(200);
		expect(await xminOf(entry.id)).toEqual(before);
		expect((await xminOf(added.body.id)).invoice_id).toBe(draft.id);
	});

	it('frees the time that lost its rate', async () => {
		const { tenant, admin } = await office();
		const { client, entry, draft } = await bookedDraft(tenant, admin, '2026-09-26');
		await api.superuser.query('delete from app.rates where client_id = $1', [client.id]);

		const refreshed = await admin.post(`/invoices/${draft.id}/refresh`);
		expect(refreshed.status).toBe(200);
		expect(refreshed.body.lines).toEqual([]);
		const { rows } = await api.superuser.query(
			'select invoice_id from app.project_entries where id = $1',
			[entry.id]
		);
		expect(rows[0].invoice_id).toBeNull();
	});

	it('keeps lines and their text when nothing billable came in', async () => {
		const { tenant, admin } = await office();
		const { client, draft, workerDesk } = await bookedDraft(tenant, admin, '2026-09-27');
		const lineId = draft.lines[0].id;
		await admin.patch(`/invoices/${draft.id}/lines/${lineId}`, {
			description: 'Relaunch Startseite'
		});
		const internal = (
			await admin.post('/projects', { clientId: client.id, name: 'Intern', billable: false })
		).body;
		const booked = await workerDesk.post('/project-entries', {
			projectId: internal.id,
			startedAt: '2026-09-27T13:00:00+02:00',
			endedAt: '2026-09-27T14:00:00+02:00',
			note: 'Abstimmung'
		});
		expect(booked.status).toBe(201);

		const refreshed = await admin.post(`/invoices/${draft.id}/refresh`);
		expect(refreshed.status).toBe(200);
		expect(
			refreshed.body.lines.map((line: { id: string; description: string }) => [
				line.id,
				line.description
			])
		).toEqual([[lineId, 'Relaunch Startseite']]);
	});
});

describe('client with invoices', () => {
	it('is locked away instead of deleted, and its invoice stays readable', async () => {
		const { tenant, admin } = await office();
		const { client, draft } = await bookedDraft(tenant, admin, '2026-09-17');
		await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });

		expect((await admin.delete(`/clients/${client.id}`)).status).toBe(204);
		expect((await admin.get(`/clients/${client.id}`)).body.restrictedAt).toEqual(
			expect.any(String)
		);
		const invoice = await admin.get(`/invoices/${draft.id}`);
		expect(invoice.status).toBe(200);
		expect(invoice.body.buyer.name).toBe('Korn KG');
	});
});

describe('render capacity', () => {
	it('cancels with a full queue and renders the document on the first download', async () => {
		const { tenant, admin } = await office();
		const original = await issuedInvoice(tenant, admin, await seedClient(api.superuser, tenant));

		const drain = await fullRenderQueue();
		let cancellationId: string;
		try {
			const cancelled = await admin.post(`/invoices/${original.id}/cancel`, {
				reason: 'Storno bei voller Warteschlange'
			});
			expect(cancelled.status).toBe(200);
			cancellationId = cancelled.body.id;
		} finally {
			await drain();
		}

		expect(await counter(tenant)).toBe(2);
		expect(await storedFormats(cancellationId)).toEqual([]);
		expect((await admin.get(`/invoices/${cancellationId}/document`)).status).toBe(200);
		expect(await storedFormats(cancellationId)).toEqual(['pdf']);
	});

	it('spends no number on an issue while the queue is too full for the page check', async () => {
		const { tenant, admin } = await office();
		const draftId = await seedDraft(api.superuser, tenant, await seedClient(api.superuser, tenant));

		const drain = await fullRenderQueue();
		try {
			const busy = await admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' });
			expect([busy.status, busy.body.code]).toEqual([503, 'RENDER_BUSY']);
			expect(busy.headers['retry-after']).toBe('5');
		} finally {
			await drain();
		}

		expect((await statusOf(draftId)).status).toBe('draft');
		expect(await counter(tenant)).toBeNull();
		const issued = await admin.post(`/invoices/${draftId}/issue`, { format: 'pdf' });
		expect(issued.body.number).toBe(`RE-${year}-0001`);
		expect(await storedFormats(draftId)).toEqual(['pdf']);
	});

	it('answers 503 on preview and time report before the limit per person counts the call', async () => {
		const tenant = await createTenant();
		const admin = await confirmedAdmin(tenant);
		const routes = [
			`/invoices/${randomUUID()}/preview.pdf`,
			`/invoices/${randomUUID()}/time-report?format=pdf`
		];

		const drain = await fullRenderQueue();
		try {
			for (const route of routes) {
				const answers: request.Response[] = [];
				for (let i = 0; i < 21; i++) answers.push(await admin.get(route));
				expect(answers.map((busy) => busy.status)).toEqual(Array(21).fill(503));
				expect(answers[0]!.body.code).toBe('RENDER_BUSY');
				expect(answers[0]!.headers['retry-after']).toBe('5');
			}
		} finally {
			await drain();
		}

		for (const route of routes) {
			expect((await admin.get(route)).status).toBe(404);
		}
	});
});

describe('500 positions per draft', () => {
	it('refuses a draft that would come out with 501 time positions and reserves nothing', async () => {
		const { tenant, admin } = await office();
		const client = (await admin.post('/clients', { name: 'Großkunde KG' })).body;
		const project = (await admin.post('/projects', { clientId: client.id, name: 'Rahmenvertrag' }))
			.body;
		await admin.post('/rates', { clientId: client.id, validFrom: '2026-01-01', rateCents: '6000' });
		const worker = await createPerson(tenant);

		await api.superuser.query('begin');
		await api.superuser.query(`select set_config('app.role', 'hr', true)`);
		await api.superuser.query(
			`insert into app.tasks (tenant_id, client_id, project_id, name)
			 select $1, $2, $3, 'Aufgabe ' || gs from generate_series(1, 501) gs`,
			[tenant, client.id, project.id]
		);
		await api.superuser.query(
			`insert into app.project_entries (tenant_id, employee_id, project_id, task_id, started_at, ended_at, note, source)
			 select $1, $2, $3, t.id,
			        timestamptz '2026-09-18 06:00+02' + t.n * interval '1 minute',
			        timestamptz '2026-09-18 06:00+02' + (t.n + 1) * interval '1 minute',
			        'Kurzer Handgriff', 'manual'
			   from (select id, row_number() over (order by id) as n from app.tasks where project_id = $3) t`,
			[tenant, worker.employeeId, project.id]
		);
		await api.superuser.query('commit');

		const refused = await admin.post('/invoices/drafts', {
			clientId: client.id,
			from: '2026-09-18',
			to: '2026-09-18'
		});
		expect(refused.status).toBe(400);
		expect(refused.body.details).toContainEqual(
			expect.objectContaining({ message: 'invoice.tooManyLines' })
		);

		const { rows } = await api.superuser.query(
			`select (select count(*) from app.invoices where client_id = $1)::int as invoices,
			        (select count(*) from app.project_entries where project_id = $2 and invoice_id is not null)::int as reserved`,
			[client.id, project.id]
		);
		expect(rows[0]).toEqual({ invoices: 0, reserved: 0 });
	});

	it('refuses a refresh that would push a full draft past 500 positions', async () => {
		const { tenant, admin } = await office();
		const { client, project, draft, workerDesk } = await bookedDraft(tenant, admin, '2026-09-19');
		await api.superuser.query(
			`insert into app.invoice_lines
				(tenant_id, invoice_id, client_id, position, kind, description, quantity_milli, unit,
				 unit_price_cents, net_cents, tax_category, tax_rate_bp)
			 select $1, $2, $3, gs, 'item', 'Position ' || gs, 1000, 'HUR', 100, 100, 'standard', 1900
			   from generate_series(2, 500) as gs`,
			[tenant, draft.id, client.id]
		);
		const task = (await admin.post(`/projects/${project.id}/tasks`, { name: 'Abnahme' })).body;
		const booked = await workerDesk.post('/project-entries', {
			projectId: project.id,
			taskId: task.id,
			startedAt: '2026-09-19T13:00:00+02:00',
			endedAt: '2026-09-19T14:00:00+02:00',
			note: 'Abnahme'
		});
		expect(booked.status).toBe(201);

		const refused = await admin.post(`/invoices/${draft.id}/refresh`);
		expect(refused.status).toBe(400);
		expect(refused.body.details).toContainEqual(
			expect.objectContaining({ message: 'invoice.tooManyLines' })
		);
		expect((await admin.get(`/invoices/${draft.id}`)).body.lines).toHaveLength(500);
	});
});

describe('long timers on a draft', () => {
	it('hints once at timer entries of twelve hours and more, never at long manual ones', async () => {
		const { tenant, admin } = await office();
		const client = (
			await admin.post('/clients', {
				name: 'Nachtschicht KG',
				street: 'Hafenstraße 12',
				postalCode: '20359',
				city: 'Hamburg'
			})
		).body;
		const project = (await admin.post('/projects', { clientId: client.id, name: 'Wartung' })).body;
		await admin.post('/rates', { clientId: client.id, validFrom: '2026-01-01', rateCents: '6000' });
		const worker = await createPerson(tenant);

		await api.superuser.query('begin');
		await api.superuser.query('set local session_replication_role = replica');
		await api.superuser.query(
			`insert into app.project_entries (tenant_id, employee_id, project_id, started_at, ended_at, note, source)
			 values ($1, $2, $3, '2026-09-21 08:00+02', '2026-09-21 21:00+02', 'Wartung', 'timer'),
			        ($1, $2, $3, '2026-09-22 07:00+02', '2026-09-22 20:30+02', 'Wartung', 'timer'),
			        ($1, $2, $3, '2026-09-23 06:00+02', '2026-09-23 20:00+02', 'Wartung', 'manual')`,
			[tenant, worker.employeeId, project.id]
		);
		await api.superuser.query('commit');

		const timers = await admin.post('/invoices/drafts', {
			clientId: client.id,
			from: '2026-09-21',
			to: '2026-09-22'
		});
		expect(timers.status).toBe(201);
		expect(timers.body.hints.filter((hint: string) => hint === 'long_timer_entry')).toHaveLength(1);
		expect(timers.body.blockers).not.toContain('long_timer_entry');

		for (const body of [{ format: 'pdf' }, { format: 'pdf', longTimersChecked: false }]) {
			const refused = await admin.post(`/invoices/${timers.body.id}/issue`, body);
			expect(refused.status).toBe(409);
			expect(refused.body.details.blockers).toEqual(['long_timer_entry']);
		}
		expect(await counter(tenant)).toBeNull();
		const issued = await admin.post(`/invoices/${timers.body.id}/issue`, {
			format: 'pdf',
			longTimersChecked: true
		});
		expect(issued.status).toBe(200);
		expect(issued.body.number).toBe(`RE-${year}-0001`);

		const manual = await admin.post('/invoices/drafts', {
			clientId: client.id,
			from: '2026-09-23',
			to: '2026-09-23'
		});
		expect(manual.body.hints).not.toContain('long_timer_entry');
		expect((await admin.post(`/invoices/${manual.body.id}/issue`, { format: 'pdf' })).status).toBe(
			200
		);
	});
});

async function bookMinutes(tenant: string, employeeId: string, projectId: string, count: number) {
	await api.superuser.query('begin');
	await api.superuser.query(`select set_config('app.role', 'hr', true)`);
	await api.superuser.query(
		`insert into app.project_entries (tenant_id, employee_id, project_id, started_at, ended_at, note, source)
		 select $1, $2, $3,
		        timestamptz '2026-04-01 06:00+02' + (gs / 600) * interval '1 day' + (gs % 600) * interval '1 minute',
		        timestamptz '2026-04-01 06:01+02' + (gs / 600) * interval '1 day' + (gs % 600) * interval '1 minute',
		        'Kurzer Handgriff', 'manual'
		   from generate_series(0, $4::int - 1) gs`,
		[tenant, employeeId, projectId, count]
	);
	await api.superuser.query('commit');
}

async function reserved(projectId: string) {
	const { rows } = await api.superuser.query(
		'select count(*)::int as n from app.project_entries where project_id = $1 and invoice_id is not null',
		[projectId]
	);
	return rows[0].n;
}

describe(`${MAX_ENTRIES} bookings per invoice`, () => {
	const tooMany = expect.objectContaining({
		field: 'entries',
		message: 'invoice.tooManyEntries',
		params: { max: MAX_ENTRIES }
	});

	async function rated(tenant: string, admin: Desk) {
		const client = (await admin.post('/clients', { name: 'Großkunde KG' })).body;
		const project = (await admin.post('/projects', { clientId: client.id, name: 'Rahmenvertrag' }))
			.body;
		await admin.post('/rates', { clientId: client.id, validFrom: '2026-01-01', rateCents: '6000' });
		return { client, project, worker: await createPerson(tenant) };
	}

	it(`refuses a draft over ${MAX_ENTRIES} bookings and reserves nothing`, async () => {
		const { tenant, admin } = await office();
		const { client, project, worker } = await rated(tenant, admin);
		await bookMinutes(tenant, worker.employeeId, project.id, MAX_ENTRIES + 1);

		const refused = await admin.post('/invoices/drafts', {
			clientId: client.id,
			from: '2026-04-01',
			to: '2026-04-30'
		});
		expect(refused.status).toBe(400);
		expect(refused.body.details).toContainEqual(tooMany);
		expect(await reserved(project.id)).toBe(0);
	});

	it(`takes ${MAX_ENTRIES}, refuses one more on refresh and on issue`, async () => {
		const { tenant, admin } = await office();
		const { client, project, worker } = await rated(tenant, admin);
		await bookMinutes(tenant, worker.employeeId, project.id, MAX_ENTRIES);
		const draft = await admin.post('/invoices/drafts', {
			clientId: client.id,
			from: '2026-04-01',
			to: '2026-04-30'
		});
		expect(draft.status).toBe(201);
		expect(await reserved(project.id)).toBe(MAX_ENTRIES);

		const late = await signedIn(api, worker.userId);
		const booked = await late.post('/project-entries', {
			projectId: project.id,
			startedAt: '2026-04-20T09:00:00+02:00',
			endedAt: '2026-04-20T10:00:00+02:00',
			note: 'Nachzügler'
		});
		expect(booked.status).toBe(201);
		const refreshed = await admin.post(`/invoices/${draft.body.id}/refresh`);
		expect(refreshed.status).toBe(400);
		expect(refreshed.body.details).toContainEqual(tooMany);
		expect(await reserved(project.id)).toBe(MAX_ENTRIES);

		const [line] = draft.body.lines;
		await api.superuser.query(
			`insert into app.invoice_line_entries (tenant_id, invoice_id, line_id, entry_id)
			 values ($1, $2, $3, $4)`,
			[tenant, draft.body.id, line.id, booked.body.id]
		);
		const issued = await admin.post(`/invoices/${draft.body.id}/issue`, { format: 'pdf' });
		expect(issued.status).toBe(400);
		expect(issued.body.details).toContainEqual(tooMany);
		expect(await counter(tenant)).toBeNull();
	});
});

describe('overdue in the list', () => {
	it('never calls a cancellation overdue', async () => {
		const { tenant, admin } = await office();
		const clientId = await seedClient(api.superuser, tenant);
		const late = await issuedInvoice(tenant, admin, clientId);
		const original = await issuedInvoice(tenant, admin, clientId);
		const cancellation = (
			await admin.post(`/invoices/${original.id}/cancel`, {
				reason: 'Doppelt gestellt, bitte ignorieren'
			})
		).body;

		await api.superuser.query('begin');
		await api.superuser.query('set local session_replication_role = replica');
		await api.superuser.query(
			`update app.invoices set due_date = date '2026-01-15' where tenant_id = $1 and status <> 'draft'`,
			[tenant]
		);
		await api.superuser.query('commit');

		const list = await admin.get(`/invoices?client=${clientId}`);
		expect(
			Object.fromEntries(
				list.body.items.map((row: { id: string; overdue: boolean }) => [row.id, row.overdue])
			)
		).toEqual({ [late.id]: true, [original.id]: false, [cancellation.id]: false });
	});
});

describe('step-up on issue and cancel', () => {
	it('refuses an unconfirmed admin and leaves draft, invoice and counter untouched', async () => {
		const { tenant, admin } = await office();
		const unconfirmed = await signedIn(api, (await createPerson(tenant, { role: 'admin' })).userId);
		const clientId = await seedClient(api.superuser, tenant);
		const draftId = await seedDraft(api.superuser, tenant, clientId);
		const original = await issuedInvoice(tenant, admin, clientId);

		const issue = await unconfirmed.post(`/invoices/${draftId}/issue`, { format: 'pdf' });
		const cancel = await unconfirmed.post(`/invoices/${original.id}/cancel`, {
			reason: 'Ohne Bestätigung storniert'
		});
		for (const refused of [issue, cancel]) {
			expect(refused.status).toBe(403);
			expect(refused.body.code).toBe('REAUTH_REQUIRED');
		}

		expect((await statusOf(draftId)).status).toBe('draft');
		expect((await statusOf(original.id)).status).toBe('issued');
		expect(await cancellationsOf(original.id)).toBe(0);
		expect(await counter(tenant)).toBe(1);
	});
});

describe('rate limit per person', () => {
	const draftEdits = [
		(desk: Desk) => desk.post(`/invoices/${randomUUID()}/lines`, freeLine),
		(desk: Desk) =>
			desk.patch(`/invoices/${randomUUID()}/lines/${randomUUID()}`, { description: 'Nachtrag' }),
		(desk: Desk) => desk.delete(`/invoices/${randomUUID()}/lines/${randomUUID()}`),
		(desk: Desk) => desk.patch(`/invoices/${randomUUID()}`, { paymentTermsDays: 30 })
	];
	let editCount = 0;
	const routes = [
		{
			route: 'drafts',
			limit: 30,
			window: 60,
			send: (desk: Desk) => desk.post('/invoices/drafts', {})
		},
		{
			route: 'preview',
			limit: 20,
			window: 60,
			send: (desk: Desk) => desk.get(`/invoices/${randomUUID()}/preview.pdf`)
		},
		{
			route: 'issue',
			limit: 30,
			window: 3600,
			send: (desk: Desk) => desk.post(`/invoices/${randomUUID()}/issue`, { format: 'pdf' })
		},
		{
			route: 'cancel',
			limit: 10,
			window: 3600,
			send: (desk: Desk) =>
				desk.post(`/invoices/${randomUUID()}/cancel`, { reason: 'Grenze der Stornos prüfen' })
		},
		{
			route: 'refresh',
			limit: 10,
			window: 60,
			send: (desk: Desk) => desk.post(`/invoices/${randomUUID()}/refresh`)
		},
		{
			route: 'draft, all four draft edits on one count',
			limit: 60,
			window: 60,
			send: (desk: Desk) => draftEdits[editCount++ % draftEdits.length]!(desk)
		}
	];

	it.each(routes)(
		'stops $route after $limit calls of one person, nobody else',
		async ({ limit, window, send }) => {
			const tenant = await createTenant();
			const first = await confirmedAdmin(tenant);
			const colleague = await confirmedAdmin(tenant);
			const stranger = await confirmedAdmin(await createTenant());

			const within: number[] = [];
			for (let i = 0; i < limit; i++) within.push((await send(first)).status);
			expect(within).not.toContain(429);

			const blocked = await send(first);
			expect(blocked.status).toBe(429);
			expect(blocked.body.code).toBe('RATE_LIMITED');
			const retryAfter = Number(blocked.headers['retry-after']);
			expect(retryAfter).toBeGreaterThan(window - 60);
			expect(retryAfter).toBeLessThanOrEqual(window);

			expect((await send(colleague)).status).not.toBe(429);
			expect((await send(stranger)).status).not.toBe(429);
		}
	);
});

describe('specimen watermark (X-01)', () => {
	it('marks preview and document of a sandbox invoice by tenants.kind, with APP_MODE=test', async () => {
		expect(process.env.APP_MODE).toBe('test');
		const { tenant, admin } = await office('sandbox');
		const { draft } = await bookedDraft(tenant, admin, '2026-09-22');
		expect((await statusOf(draft.id)).specimen).toBe(true);

		const preview = await pdfText(
			await admin.get(`/invoices/${draft.id}/preview.pdf`).responseType('blob')
		);
		expect(preview).toContain('Entwurf – keine Rechnung');
		expect(preview).toContain(SPECIMEN);

		const issued = await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });
		expect(issued.body).toMatchObject({ specimen: true, number: `MUSTER-${year}-0001` });
		expect((await statusOf(draft.id)).specimen).toBe(true);

		const document = await pdfText(
			await admin.get(`/invoices/${draft.id}/document`).responseType('blob')
		);
		expect(document).toContain(SPECIMEN);
		expect(document).not.toContain('Entwurf');

		const report = await pdfText(
			await admin.get(`/invoices/${draft.id}/time-report?format=pdf`).responseType('blob')
		);
		expect(report).toContain('Muster – Stundennachweis aus dem Musterbetrieb');
	});

	it('never marks the invoice of a live tenant', async () => {
		const { tenant, admin } = await office();
		const { draft } = await bookedDraft(tenant, admin, '2026-09-23');
		expect((await statusOf(draft.id)).specimen).toBe(false);

		const preview = await pdfText(
			await admin.get(`/invoices/${draft.id}/preview.pdf`).responseType('blob')
		);
		expect(preview).toContain('Entwurf – keine Rechnung');
		expect(preview).not.toContain('Musterrechnung');

		const issued = await admin.post(`/invoices/${draft.id}/issue`, { format: 'pdf' });
		expect(issued.body).toMatchObject({ specimen: false, number: `RE-${year}-0001` });
		const document = await pdfText(
			await admin.get(`/invoices/${draft.id}/document`).responseType('blob')
		);
		expect(document).not.toContain('Musterrechnung');

		const report = await pdfText(
			await admin.get(`/invoices/${draft.id}/time-report?format=pdf`).responseType('blob')
		);
		expect(report).not.toContain('Musterbetrieb');
	});
});
