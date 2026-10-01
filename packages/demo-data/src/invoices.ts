import {
	aggregate,
	invoiceTotals,
	linesFromCells,
	roundingFor,
	taxTreatment,
	vatRateFor,
	type Cell,
	type ProjectEntry,
	type Rate
} from '@zeit/rules';
import { leitwegIdValid, type InvoiceFormat, type Locale } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { dateOf, iso, local } from './calendar';
import type { PlanRow, ProjectBook } from './index';
import type { Random } from './random';

export type Ledger = Pick<
	ProjectBook,
	'clients' | 'projects' | 'tasks' | 'rates' | 'projectEntries'
>;

export type Desk = {
	rng: Random;
	ledger: Ledger;
	profile: ProjectBook['billingProfile'];
	userId: string;
	invoices: PlanRow<'invoices'>[];
	lastSeq: number;
};

type Invoice = PlanRow<'invoices'>;
type Client = PlanRow<'clients'>;

const INTRO: Record<Locale, string> = {
	de: 'vielen Dank für die gute Zusammenarbeit. Anbei die Rechnung für die erbrachten Leistungen.',
	en: 'thank you for the good cooperation. Please find attached the invoice for the services rendered.'
};

const CLOSING: Record<Locale, string> = {
	de: 'Bitte überweisen Sie den Rechnungsbetrag bis zum genannten Zahlungsziel auf das unten stehende Konto.',
	en: 'Please transfer the invoice amount to the account below by the payment due date stated above.'
};

function formatOf(client: Client, preset: InvoiceFormat): InvoiceFormat {
	if (!client.isBusiness) return 'pdf';
	if (client.buyerReference !== null && leitwegIdValid(client.buyerReference)) return 'xrechnung';
	return preset === 'pdf' ? 'zugferd' : preset;
}

export function draft(
	desk: Desk,
	client: Client,
	from: Temporal.PlainDate,
	to: Temporal.PlainDate,
	createdOn: Temporal.PlainDate,
	prefix = ''
): Invoice {
	const { rng, ledger, profile } = desk;
	const id = rng.uuid();
	const projects = new Map(ledger.projects.map((project) => [project.id, project]));
	const taskNames = new Map(ledger.tasks.map((task) => [task.id, task.name]));
	const booked = new Map(ledger.projectEntries.map((entry) => [entry.id, entry]));

	const open = ledger.projectEntries.flatMap((entry): ProjectEntry[] => {
		if (
			entry.endedAt === null ||
			entry.invoiceId !== null ||
			projects.get(entry.projectId)!.clientId !== client.id
		) {
			return [];
		}
		const start = Temporal.Instant.from(entry.startedAt);
		const workday = dateOf(start);
		if (
			Temporal.PlainDate.compare(workday, from) < 0 ||
			Temporal.PlainDate.compare(workday, to) > 0
		) {
			return [];
		}
		return [
			{
				id: entry.id,
				employeeId: entry.employeeId,
				clientId: client.id,
				projectId: entry.projectId,
				taskId: entry.taskId,
				workday,
				billable: true,
				start,
				end: Temporal.Instant.from(entry.endedAt)
			}
		];
	});
	const rates = ledger.rates
		.filter((rate) => rate.clientId === null || rate.clientId === client.id)
		.map(({ validFrom, rateCents, ...dimensions }): Rate => ({
			...dimensions,
			validFrom: Temporal.PlainDate.from(validFrom),
			cents: BigInt(rateCents)
		}));
	const { rule } = roundingFor(
		{ incrementMinutes: profile.roundingIncrementMin, mode: profile.roundingMode },
		{ incrementMinutes: client.roundingIncrementMin, mode: client.roundingMode },
		{ incrementMinutes: null, mode: null }
	);
	const cells = aggregate(open, { rates, rounding: () => rule });
	const taxCategory = taxTreatment(profile, client);

	const keyOf = (projectId: string, taskId: string | null, cents: bigint, taxRateBp: number) =>
		[projectId, taskId ?? '', cents, taxRateBp].join('|');
	const firstCells = new Map<string, Cell>();
	for (const cell of cells) {
		if (!cell.billable || !cell.rate) continue;
		const key = keyOf(
			cell.projectId,
			cell.taskId,
			cell.rate.cents,
			vatRateFor(taxCategory, cell.date)
		);
		if (!firstCells.has(key)) firstCells.set(key, cell);
	}

	const lines = linesFromCells(cells, taxCategory).map((line, i): Invoice['lines'][number] => {
		const first = firstCells.get(
			keyOf(line.projectId, line.taskId, line.rateCents, line.taxRateBp)
		)!;
		return {
			id: rng.uuid(),
			position: i + 1,
			kind: 'time',
			projectId: line.projectId,
			taskId: line.taskId,
			description:
				line.taskId === null
					? `${prefix}${projects.get(line.projectId)!.name}`
					: `${prefix}${projects.get(line.projectId)!.name} – ${taskNames.get(line.taskId)}`,
			serviceFrom: line.serviceFrom.toString(),
			serviceTo: line.serviceTo.toString(),
			minutes: line.minutes,
			quantityMilli: null,
			unit: null,
			unitPriceCents: Number(line.rateCents),
			netCents: Number(line.netCents),
			taxCategory: line.taxCategory,
			taxRateBp: line.taxRateBp,
			exemptionReason: null,
			derivation: {
				entries: line.entryIds.map((entryId) => {
					const { startedAt, endedAt } = booked.get(entryId)!;
					return { id: entryId, startedAt, endedAt };
				}),
				rounding: first.rounding,
				rate: { cents: String(line.rateCents), explanation: first.rate!.explanation }
			},
			entryIds: [...line.entryIds]
		};
	});
	for (const entryId of lines.flatMap((line) => line.entryIds)) {
		booked.get(entryId)!.invoiceId = id;
	}

	const locale = client.invoiceLocale;
	const invoice: Invoice = {
		id,
		kind: 'invoice',
		status: 'draft',
		clientId: client.id,
		refersToId: null,
		number: null,
		numberYear: null,
		numberSeq: null,
		issueDate: null,
		dueDate: null,
		serviceFrom: from.toString(),
		serviceTo: to.toString(),
		paymentTermsDays: client.paymentTermsDays ?? profile.paymentTermsDays,
		locale,
		format: formatOf(client, profile.defaultFormat),
		taxProfile: profile.taxProfile,
		taxTreatment: taxCategory,
		seller: null,
		buyer: null,
		introText: INTRO[locale],
		closingText: CLOSING[locale],
		netCents: 0,
		taxCents: 0,
		grossCents: 0,
		paidOn: null,
		cancelReason: null,
		cancelledAt: null,
		cancelledBy: null,
		issuedAt: null,
		issuedBy: null,
		createdBy: desk.userId,
		createdAt: iso(local(createdOn, 450 + rng.int(0, 25))),
		lines
	};
	desk.invoices.push(invoice);
	return invoice;
}

export function issue(desk: Desk, invoice: Invoice, on: Temporal.PlainDate) {
	const { profile } = desk;
	const client = desk.ledger.clients.find((candidate) => candidate.id === invoice.clientId)!;
	const totals = invoiceTotals(
		invoice.lines.map((line) => ({
			netCents: BigInt(line.netCents),
			taxCategory: line.taxCategory,
			taxRateBp: line.taxRateBp
		}))
	);
	const seq = ++desk.lastSeq;
	const slot = 480 + 10 * seq;
	Object.assign(invoice, {
		status: 'issued',
		number: `${profile.invoicePrefix}${on.year}-${String(seq).padStart(4, '0')}`,
		numberYear: on.year,
		numberSeq: seq,
		issueDate: on.toString(),
		dueDate: on.add({ days: invoice.paymentTermsDays }).toString(),
		seller: {
			legalName: profile.legalName,
			street: profile.street,
			postalCode: profile.postalCode,
			city: profile.city,
			countryCode: profile.countryCode,
			taxNumber: profile.taxNumber,
			vatId: profile.vatId,
			iban: profile.iban,
			bic: profile.bic,
			bankName: profile.bankName,
			contactName: profile.contactName,
			contactEmail: profile.contactEmail,
			contactPhone: profile.contactPhone,
			registerCourt: profile.registerCourt,
			registerNumber: profile.registerNumber
		},
		buyer: {
			name: client.name,
			street: client.street,
			postalCode: client.postalCode,
			city: client.city,
			countryCode: client.countryCode,
			isBusiness: client.isBusiness,
			vatId: client.vatId,
			email: client.email,
			buyerReference: client.buyerReference,
			number: client.number
		},
		netCents: Number(totals.netCents),
		taxCents: Number(totals.taxCents),
		grossCents: Number(totals.grossCents),
		createdAt: iso(local(on, slot + desk.rng.int(0, 4))),
		issuedAt: iso(local(on, slot + desk.rng.int(5, 9))),
		issuedBy: desk.userId
	} satisfies Partial<Invoice>);
}

export function cancel(desk: Desk, original: Invoice, on: Temporal.PlainDate, reason: string) {
	const { rng } = desk;
	const cancellation: Invoice = {
		...original,
		id: rng.uuid(),
		kind: 'cancellation',
		refersToId: original.id,
		lines: original.lines.map((line) => ({
			...line,
			id: rng.uuid(),
			minutes: line.minutes === null ? null : 0 - line.minutes,
			quantityMilli: line.quantityMilli === null ? null : 0 - line.quantityMilli,
			netCents: 0 - line.netCents,
			entryIds: [...line.entryIds]
		}))
	};
	desk.invoices.push(cancellation);
	issue(desk, cancellation, on);
	cancellation.createdAt = cancellation.issuedAt!;
	Object.assign(original, {
		status: 'cancelled',
		cancelReason: reason,
		cancelledAt: cancellation.issuedAt,
		cancelledBy: desk.userId
	} satisfies Partial<Invoice>);
	for (const entry of desk.ledger.projectEntries) {
		if (entry.invoiceId === original.id) entry.invoiceId = null;
	}
}

export function pay(invoice: Invoice, on: Temporal.PlainDate) {
	invoice.status = 'paid';
	invoice.paidOn = on.toString();
}
