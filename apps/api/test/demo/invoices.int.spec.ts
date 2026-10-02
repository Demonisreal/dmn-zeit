import { invoiceSchema, type Invoice, type InvoicePage, type Persona } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { pdfParse } from '../../src/documents/pdf-parse.fixture';
import type { RenderJob } from '../../src/documents/worker';
import { expectContract, type Browser } from '../auth/api';
import { openSandbox, startDemo, type Demo } from './sandbox';

vi.mock('../../src/documents/worker', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../src/documents/worker')>();
	const { withRenderSlot } = await import('../../src/documents/render-limit');
	return {
		...original,
		renderInWorker: vi.fn((job: RenderJob) => withRenderSlot(() => original.renderJob(job)))
	};
});

const SPECIMEN = 'Musterrechnung – keine Rechnung im Sinne des § 14 UStG';

type Row = {
	id: string;
	kind: string;
	status: string;
	number: string | null;
	refers_to_id: string | null;
	format: string;
	tax_treatment: string;
	net_cents: number;
	tax_cents: number;
	gross_cents: number;
	specimen: boolean;
	cancelled_at: Date | null;
};

let demo: Demo;
let today: string;

beforeAll(async () => {
	demo = await startDemo();
	const { rows } = await demo.superuser.query(
		`select to_char((now() at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD') as today`
	);
	today = rows[0].today;
});

afterAll(() => demo.app.close());

const year = () => today.slice(0, 4);

async function switchTo(visitor: Browser, pick: (persona: Persona) => boolean) {
	const personas = (await visitor.get('/demo/personas')).body as Persona[];
	const answer = await visitor.post('/demo/switch', { userId: personas.find(pick)!.userId });
	expect(answer.status).toBe(200);
	visitor.remember(answer);
}

async function soloOf(tenantId: string) {
	const { rows } = await demo.superuser.query(
		`select s.id from app.tenants t
		   join app.tenants s on s.sandbox_group = t.sandbox_group and s.workspace = 'solo'
		  where t.id = $1`,
		[tenantId]
	);
	return rows[0].id as string;
}

async function invoicesOf(tenantId: string) {
	const { rows } = await demo.superuser.query<Row>(
		`select id, kind::text, status::text, number, refers_to_id, format::text, tax_treatment::text,
		        net_cents::int, tax_cents::int, gross_cents::int, specimen, cancelled_at
		   from app.invoices where tenant_id = $1 order by number_seq nulls last`,
		[tenantId]
	);
	return rows;
}

async function counterOf(tenantId: string) {
	const { rows } = await demo.superuser.query(
		'select year, last_seq from app.invoice_counters where tenant_id = $1',
		[tenantId]
	);
	return rows;
}

const vatDigitHolds = (vatId: string) => {
	let product = 10;
	for (const digit of vatId.slice(2, 10)) {
		product = (2 * ((Number(digit) + product) % 10 || 10)) % 11;
	}
	return (11 - product) % 10 === Number(vatId[10]);
};

const madeUp = (party: Record<string, string | null>) =>
	/\(Beispiel\)$/.test(party.legalName!) &&
	!vatDigitHolds(party.vatId!) &&
	party.iban!.slice(4, 12) === '00000000' &&
	/\.example\.test$/.test(party.contactEmail!);

async function pdfText(body: Buffer) {
	return (await pdfParse(body)).text.replace(/\s+/g, ' ');
}

describe('invoices of the freelancer in the demo', () => {
	let visitor: Browser;
	let tenantId: string;
	let invoices: Row[];
	const nth = (seq: number) => invoices.find((row) => row.number === `MUSTER-${year()}-000${seq}`)!;

	beforeAll(async () => {
		const opened = await openSandbox(demo);
		visitor = opened.visitor;
		await switchTo(visitor, (persona) => persona.workspace === 'solo');
		tenantId = await soloOf(opened.session.tenant.id);
		invoices = await invoicesOf(tenantId);
	});

	it('numbers MUSTER-<year>-0001 to 0009, leaves the draft without one and the counter at 9', async () => {
		expect(invoices.map((row) => row.number)).toEqual([
			...Array.from({ length: 9 }, (_, i) => `MUSTER-${year()}-000${i + 1}`),
			null
		]);
		expect(invoices.at(-1)!.status).toBe('draft');
		expect(await counterOf(tenantId)).toEqual([{ year: Number(year()), last_seq: 9 }]);
	});

	it('runs through all four statuses, and 0005 takes back 0004 to the cent', () => {
		expect(new Set(invoices.map((row) => row.status))).toEqual(
			new Set(['draft', 'issued', 'paid', 'cancelled'])
		);
		const [wrong, cancellation] = [nth(4), nth(5)];
		expect(wrong.status).toBe('cancelled');
		expect(wrong.cancelled_at).not.toBeNull();
		expect(cancellation).toMatchObject({
			kind: 'cancellation',
			status: 'issued',
			refers_to_id: wrong.id,
			tax_treatment: wrong.tax_treatment,
			net_cents: 0 - wrong.net_cents,
			tax_cents: 0 - wrong.tax_cents,
			gross_cents: 0 - wrong.gross_cents
		});
	});

	it('bills the client abroad under reverse charge, without tax', async () => {
		const abroad = invoices.filter((row) => row.tax_treatment === 'reverse_charge');
		expect(abroad).toHaveLength(1);
		expect([abroad[0]!.tax_cents, abroad[0]!.gross_cents]).toEqual([0, abroad[0]!.net_cents]);
		const { rows } = await demo.superuser.query(
			`select distinct tax_category::text, tax_rate_bp from app.invoice_lines where invoice_id = $1`,
			[abroad[0]!.id]
		);
		expect(rows).toEqual([{ tax_category: 'reverse_charge', tax_rate_bp: 0 }]);
	});

	it('marks every invoice as specimen', () => {
		expect(invoices.filter((row) => !row.specimen)).toEqual([]);
	});

	it('locks exactly the time of the draft and the invoices not cancelled', async () => {
		const { rows } = await demo.superuser.query(
			`select count(*)::int as entries, count(distinct e.id)::int as distinct_entries,
			        count(h.invoice_id)::int as held,
			        count(*) filter (where e.invoice_id is distinct from h.invoice_id)::int as wrong
			   from app.project_entries e
			   left join (
			     select le.entry_id, le.invoice_id
			       from app.invoice_line_entries le join app.invoices i on i.id = le.invoice_id
			      where i.kind = 'invoice' and i.status <> 'cancelled'
			   ) h on h.entry_id = e.id
			  where e.tenant_id = $1`,
			[tenantId]
		);
		const { entries, distinct_entries: distinctEntries, held, wrong } = rows[0];
		expect(held).toBeGreaterThan(0);
		expect(entries).toBe(distinctEntries);
		expect(wrong).toBe(0);
	});

	it('lists them over http, with only 0008 overdue', async () => {
		const answer = await visitor.get('/invoices');
		expect(answer.status).toBe(200);
		const page = answer.body as InvoicePage;
		expect(page.items).toHaveLength(10);
		expect(page.items.filter((item) => item.overdue).map((item) => item.number)).toEqual(
			today.endsWith('-01-01') ? [] : [`MUSTER-${year()}-0008`]
		);
	});

	it('answers every issued invoice in the shape of the api contract', async () => {
		for (const row of invoices.filter((candidate) => candidate.status !== 'draft')) {
			const answer = await visitor.get(`/invoices/${row.id}`);
			expect(answer.status).toBe(200);
			expectContract(invoiceSchema, answer.body);
		}
	});

	it('renders a document on the first request, stores it and serves the same bytes after', async () => {
		const paid = nth(1);
		const stored = async () =>
			(
				await demo.superuser.query(
					'select format from app.invoice_documents where invoice_id = $1 order by format',
					[paid.id]
				)
			).rows.map((row) => row.format);
		expect(await stored()).toEqual([]);

		const first = await visitor.get(`/invoices/${paid.id}/document`).responseType('blob');
		expect(first.status).toBe(200);
		expect(first.headers['content-type']).toContain('application/pdf');
		expect(await stored()).toContain(paid.format === 'zugferd' ? 'zugferd' : 'pdf');

		const second = await visitor.get(`/invoices/${paid.id}/document`).responseType('blob');
		expect(second.headers.etag).toBe(first.headers.etag);
		expect(Buffer.compare(second.body, first.body)).toBe(0);
		expect(await pdfText(first.body)).toContain(SPECIMEN);
	});

	it('serves the xml of the invoice to the public client', async () => {
		const city = invoices.find((row) => row.format === 'xrechnung')!;
		expect(city.status).toBe('issued');
		const answer = await visitor.get(`/invoices/${city.id}/xml`).responseType('blob');
		expect(answer.status).toBe(200);
		expect(answer.headers['content-type']).toContain('application/xml');
		const xml = answer.body.toString('utf8');
		expect(xml).toContain(city.number);
		expect(xml).toContain('Musterrechnung');
	});

	it('lets her issue the draft with the hosting fee and cancel it again, without a step-up', async () => {
		const draft = (await visitor.get(`/invoices/${invoices.at(-1)!.id}`)).body as Invoice;
		expect(draft.blockers).toEqual([]);
		expect(draft.lines.at(-1)).toMatchObject({ kind: 'item', description: 'Hosting-Pauschale' });

		const issued = await visitor.post(`/invoices/${draft.id}/issue`, { format: draft.format });
		expect(issued.status).toBe(200);
		expectContract(invoiceSchema, issued.body);
		expect(issued.body).toMatchObject({
			number: `MUSTER-${year()}-0010`,
			specimen: true,
			seller: (await visitor.get(`/invoices/${nth(1).id}`)).body.seller
		});

		const cancelled = await visitor.post(`/invoices/${draft.id}/cancel`, {
			reason: 'Pauschale doppelt berechnet, wird neu gestellt'
		});
		expect(cancelled.status).toBe(200);
		expectContract(invoiceSchema, cancelled.body);
		expect(cancelled.body).toMatchObject({ kind: 'cancellation', number: `MUSTER-${year()}-0011` });
	});

	it('lets her bill the public client as xrechnung with the seller of the world', async () => {
		const { rows } = await demo.superuser.query(
			`select c.id as client, p.id as project from app.clients c join app.projects p on p.client_id = c.id
			  where c.tenant_id = $1 and c.buyer_reference is not null`,
			[tenantId]
		);
		const day = Temporal.PlainDate.from(today).subtract({ days: 1 });
		const at = (time: string) =>
			day.toZonedDateTime({ timeZone: 'Europe/Berlin', plainTime: time }).toString({
				timeZoneName: 'never'
			});
		const booked = await visitor.post('/project-entries', {
			projectId: rows[0].project,
			startedAt: at('05:00'),
			endedAt: at('06:00'),
			note: 'Abstimmung Zählerstandsimport'
		});
		expect(booked.status).toBe(201);

		const draft = await visitor.post('/invoices/drafts', {
			clientId: rows[0].client,
			from: day.toString(),
			to: day.toString()
		});
		expect(draft.status).toBe(201);
		expect(draft.body).toMatchObject({ format: 'xrechnung', blockers: [] });

		const issued = await visitor.post(`/invoices/${draft.body.id}/issue`, { format: 'xrechnung' });
		expect(issued.status).toBe(200);
		expectContract(invoiceSchema, issued.body);
		expect(issued.body.seller).toEqual((await visitor.get(`/invoices/${nth(9).id}`)).body.seller);
		const xml = await visitor.get(`/invoices/${draft.body.id}/xml`).responseType('blob');
		expect(xml.status).toBe(200);
		expect(xml.body.toString('utf8')).toContain(issued.body.number);
	});
});

describe('invoices of the demo office', () => {
	let visitor: Browser;
	let tenantId: string;
	let invoices: Row[];

	beforeAll(async () => {
		const opened = await openSandbox(demo);
		visitor = opened.visitor;
		tenantId = opened.session.tenant.id;
		await switchTo(visitor, (persona) => persona.role === 'hr' && persona.workspace === 'company');
		invoices = await invoicesOf(tenantId);
	});

	it('has two paid invoices and a draft, the counter at 2', async () => {
		expect(invoices.map((row) => [row.number, row.status])).toEqual([
			[`MUSTER-${year()}-0001`, 'paid'],
			[`MUSTER-${year()}-0002`, 'paid'],
			[null, 'draft']
		]);
		expect(await counterOf(tenantId)).toEqual([{ year: Number(year()), last_seq: 2 }]);
		expect(invoices.filter((row) => !row.specimen)).toEqual([]);
	});

	it('lists them for hr over http', async () => {
		const answer = await visitor.get('/invoices');
		expect(answer.status).toBe(200);
		expect((answer.body as InvoicePage).items.map((item) => item.number).sort()).toEqual([
			`MUSTER-${year()}-0001`,
			`MUSTER-${year()}-0002`,
			null
		]);
	});

	it('lets the hr persona issue the draft of last month in the format the seed chose', async () => {
		const draft = (await visitor.get(`/invoices/${invoices.at(-1)!.id}`)).body as Invoice;
		expect(draft.blockers).toEqual([]);

		const issued = await visitor.post(`/invoices/${draft.id}/issue`, { format: draft.format });
		expect(issued.status).toBe(200);
		expectContract(invoiceSchema, issued.body);
		expect(issued.body).toMatchObject({
			number: `MUSTER-${year()}-0003`,
			format: draft.format,
			seller: (await visitor.get(`/invoices/${invoices[0]!.id}`)).body.seller
		});
		const document = await visitor.get(`/invoices/${draft.id}/document`).responseType('blob');
		expect(document.status).toBe(200);
		expect(await pdfText(document.body)).toContain(SPECIMEN);
	});
});

describe('a freelancer who switched to small business in the demo', () => {
	it('issues with the seller of her profile, exactly as the draft showed it', async () => {
		const { visitor, session } = await openSandbox(demo);
		await switchTo(visitor, (persona) => persona.workspace === 'solo');
		const tenantId = await soloOf(session.tenant.id);

		const profile = (await visitor.get('/billing/profile')).body;
		delete profile.countryCode;
		const switched = await visitor.patch('/billing/profile', {
			...profile,
			taxProfile: 'small_business',
			previousYearRevenueCents: '2400000'
		});
		expect(switched.status).toBe(200);

		const { rows } = await demo.superuser.query(
			`select c.id as client, p.id as project from app.clients c join app.projects p on p.client_id = c.id
			  where c.tenant_id = $1 and p.code = 'NL-WARTUNG'`,
			[tenantId]
		);
		const day = Temporal.PlainDate.from(today).subtract({ days: 1 });
		const at = (time: string) =>
			day.toZonedDateTime({ timeZone: 'Europe/Berlin', plainTime: time }).toString({
				timeZoneName: 'never'
			});
		const booked = await visitor.post('/project-entries', {
			projectId: rows[0].project,
			startedAt: at('05:00'),
			endedAt: at('06:00'),
			note: 'Update der Abhängigkeiten'
		});
		expect(booked.status).toBe(201);

		const created = await visitor.post('/invoices/drafts', {
			clientId: rows[0].client,
			from: day.toString(),
			to: day.toString()
		});
		expect(created.status).toBe(201);
		const draft = (await visitor.get(`/invoices/${created.body.id}`)).body as Invoice;
		expect(draft).toMatchObject({ taxProfile: 'small_business', blockers: [] });

		const issued = await visitor.post(`/invoices/${draft.id}/issue`, { format: draft.format });
		expect(issued.status).toBe(200);
		expect(issued.body.seller).toEqual(draft.seller);
		expect(issued.body.seller).toMatchObject({
			legalName: profile.legalName,
			contactEmail: profile.contactEmail
		});
	});
});

describe('sellers in the demo', () => {
	it('puts only made-up data on the billing profiles and every frozen seller of a sandbox', async () => {
		const { session } = await openSandbox(demo);
		const tenants = [session.tenant.id, await soloOf(session.tenant.id)];
		const { rows } = await demo.superuser.query(
			`select jsonb_build_object('legalName', legal_name, 'vatId', vat_id, 'iban', iban,
			          'contactEmail', contact_email) as party
			   from app.billing_profiles where tenant_id = any($1)
			 union all
			 select seller from app.invoices where tenant_id = any($1) and seller is not null`,
			[tenants]
		);
		expect(rows.length).toBeGreaterThan(2);
		expect(rows.map((row) => row.party).filter((party) => !madeUp(party))).toEqual([]);
	});
});
