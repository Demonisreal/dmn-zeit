import { readFile } from 'node:fs/promises';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { seedBillingProfile } from '../helpers/invoices';
import { createPerson, createTenant } from '../helpers/pg';
import { seat, type Seat } from '../months/firm';

let api: Api;
let admin: Seat;
let hrEn: Seat;
let worker: Desk;
let clientId: string;
let website: { id: string; tasks: Record<string, string> };
let firstInvoiceId: string;
let secondInvoiceId: string;

const FILENAME = 'time-report-2026-04-01-2026-04-30-B_ckerei_Korn_GmbH.csv';

const golden = (name: string) => readFile(new URL(`./golden/${name}`, import.meta.url));

function raw(test: request.Test) {
	return test.buffer(true).parse((res, done) => {
		const chunks: Buffer[] = [];
		res.on('data', (chunk: Buffer) => chunks.push(chunk));
		res.on('end', () => done(null, Buffer.concat(chunks)));
	});
}

async function book(
	projectId: string,
	startedAt: string,
	endedAt: string,
	note: string,
	taskId?: string
) {
	const entry = await worker.post('/project-entries', {
		projectId,
		taskId,
		startedAt,
		endedAt,
		note
	});
	expect(entry.status).toBe(201);
	return entry.body.id as string;
}

const exported = (desk: Desk) =>
	raw(desk.get(`/exports/time-report?client=${clientId}&from=2026-04-01&to=2026-04-30&format=csv`));
const ofInvoice = (desk: Desk, invoiceId: string) =>
	raw(desk.get(`/invoices/${invoiceId}/time-report?format=csv`));

async function issuedApril() {
	const draft = await admin.desk.post('/invoices/drafts', {
		clientId,
		from: '2026-04-01',
		to: '2026-04-30'
	});
	expect(draft.status).toBe(201);
	const issued = await admin.desk.post(`/invoices/${draft.body.id}/issue`, { format: 'pdf' });
	expect(issued.status).toBe(200);
	return issued.body.id as string;
}

async function expectGolden(answer: request.Response, name: string) {
	expect(answer.status).toBe(200);
	expect(answer.headers['content-type']).toBe('text/csv; charset=utf-8');
	const expected = await golden(name);
	expect(answer.body.toString('utf8')).toBe(expected.toString('utf8'));
	expect(answer.body.equals(expected)).toBe(true);
}

beforeAll(async () => {
	api = await startApi();
	const tenant = await createTenant();
	await seedBillingProfile(api.superuser, tenant);
	admin = await seat(api, tenant, 'admin', { locale: 'de', reauth: true });
	hrEn = await seat(api, tenant, 'hr', { name: 'Harriet Payroll', locale: 'en' });
	worker = await signedIn(api, (await createPerson(tenant)).userId);

	const client = await admin.desk.post('/clients', {
		name: 'Bäckerei Korn GmbH',
		street: 'Hafenstraße 12',
		postalCode: '48143',
		city: 'Münster'
	});
	clientId = client.body.id;
	await admin.desk.post('/rates', { clientId, validFrom: '2026-01-01', rateCents: '9500' });

	const project = (await admin.desk.post('/projects', { clientId, name: 'Website' })).body;
	const task = async (name: string, billable?: boolean) =>
		(await admin.desk.post(`/projects/${project.id}/tasks`, { name, billable })).body.id as string;
	website = {
		id: project.id,
		tasks: {
			build: await task('Umsetzung'),
			talk: await task('Abstimmung'),
			internal: await task('Intern', false)
		}
	};
	const till = (await admin.desk.post('/projects', { clientId, name: 'Kassensystem' })).body.id;

	const other = (await admin.desk.post('/clients', { name: 'Agentur Nordlicht GmbH' })).body;
	const relaunch = (await admin.desk.post('/projects', { clientId: other.id, name: 'Relaunch' }))
		.body.id;

	await book(till, '2026-03-31T23:00:00+02:00', '2026-03-31T23:45:00+02:00', 'Vorabend');
	await book(
		website.id,
		'2026-04-01T09:00:00+02:00',
		'2026-04-01T11:30:00+02:00',
		'Startseite; Header "neu"',
		website.tasks.build
	);
	await book(
		website.id,
		'2026-04-01T13:00:00+02:00',
		'2026-04-01T13:47:30+02:00',
		'Abstimmung mit Frau Korn\nRückruf am Freitag',
		website.tasks.talk
	);
	await book(till, '2026-04-02T08:15:00+02:00', '2026-04-02T10:00:00+02:00', '=SUMME(A1:A3)');
	const voided = await book(
		till,
		'2026-04-08T10:00:00+02:00',
		'2026-04-08T11:00:00+02:00',
		'Doppelt erfasst'
	);
	expect((await worker.post(`/project-entries/${voided}/void`)).status).toBe(200);
	await book(relaunch, '2026-04-08T13:00:00+02:00', '2026-04-08T14:00:00+02:00', 'Anderer Kunde');
	await book(
		website.id,
		'2026-04-15T14:00:00+02:00',
		'2026-04-15T16:00:00+02:00',
		'+49 221 4710-318 zurückgerufen, Termin steht',
		website.tasks.build
	);
	await book(
		till,
		'2026-04-30T23:10:00+02:00',
		'2026-05-01T00:40:00+02:00',
		'Kassenumstellung über Nacht'
	);
	await book(till, '2026-05-01T00:50:00+02:00', '2026-05-01T01:20:00+02:00', 'Erster Mai');
});

afterAll(() => api.app.close());

describe('time report csv for april 2026', () => {
	it('matches the golden file in the language of a german reader', async () => {
		const answer = await exported(admin.desk);
		await expectGolden(answer, 'time-report-2026-04.csv');
		expect(answer.headers['content-disposition']).toBe(
			`attachment; filename="${FILENAME}"; filename*=UTF-8''${FILENAME}`
		);
	});

	it('matches the english golden file for an english reader', async () => {
		await expectGolden(await exported(hrEn.desk), 'time-report-2026-04.en.csv');
	});

	it('gives the issued invoice the same file, in the language of the invoice', async () => {
		firstInvoiceId = await issuedApril();
		const answer = await ofInvoice(hrEn.desk, firstInvoiceId);
		await expectGolden(answer, 'time-report-2026-04.csv');
		expect(answer.headers['content-disposition']).toBe(`attachment; filename="${FILENAME}"`);
	});

	it('writes the invoice of an english client in english, the export stays with the reader', async () => {
		const cancelled = await admin.desk.post(`/invoices/${firstInvoiceId}/cancel`, {
			reason: 'Rechnung auf Englisch neu ausstellen'
		});
		expect(cancelled.status).toBe(200);
		expect((await admin.desk.patch(`/clients/${clientId}`, { invoiceLocale: 'en' })).status).toBe(
			200
		);
		secondInvoiceId = await issuedApril();

		await expectGolden(await ofInvoice(admin.desk, secondInvoiceId), 'time-report-2026-04.en.csv');
		await expectGolden(await ofInvoice(admin.desk, firstInvoiceId), 'time-report-2026-04.csv');
		await expectGolden(await exported(admin.desk), 'time-report-2026-04.csv');
	});

	it('lists time that is not billable in the export only, invoices keep their frozen time', async () => {
		await book(
			website.id,
			'2026-04-20T09:00:00+02:00',
			'2026-04-20T09:30:00+02:00',
			'Interne Abstimmung',
			website.tasks.internal
		);

		const rows = (await golden('time-report-2026-04.csv')).toString('utf8').split('\r\n');
		const expected = [
			...rows.slice(0, 5),
			'2026-04-20;Website;Intern;Interne Abstimmung;30;',
			rows[5],
			';;;total;543;',
			';;;billable;513;',
			''
		].join('\r\n');
		const answer = await exported(admin.desk);
		expect(answer.status).toBe(200);
		expect(answer.body.toString('utf8')).toBe(expected);

		await expectGolden(await ofInvoice(admin.desk, firstInvoiceId), 'time-report-2026-04.csv');
		await expectGolden(await ofInvoice(admin.desk, secondInvoiceId), 'time-report-2026-04.en.csv');
	});
});
