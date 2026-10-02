import {
	aggregate,
	invoiceForm,
	invoiceTotals,
	isBillable,
	linesFromCells,
	roundingFor,
	taxMismatches,
	taxTreatment,
	totalBlockers,
	vatRateFor,
	type Cell,
	type Explanation,
	type ProjectEntry as BilledEntry,
	type Rate as BillingRate,
	type RoundingOverride,
	type TaxCategory
} from '@zeit/rules';
import type { BillingProfile, Invoice, InvoiceLine, Locale } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { isLeitwegId } from '../einvoice/mapping';
import { TEXTS } from '../einvoice/texts';
import { TENANT_ROUNDING, toBillingRate } from '../projects/project-engine';
import { legalNoteTexts } from './texts';

export type UnbilledEntryRow = {
	id: string;
	employeeId: string;
	projectId: string;
	taskId: string | null;
	workday: string;
	startedAt: string;
	endedAt: string;
	entryBillable: boolean | null;
	taskBillable: boolean | null;
	projectBillable: boolean;
	projectName: string;
	taskName: string | null;
	projectIncrement: number | null;
	projectMode: 'up' | 'nearest' | 'down' | null;
	clientIncrement: number | null;
	clientMode: 'up' | 'nearest' | 'down' | null;
	source: 'timer' | 'manual' | 'seed';
};

export type NewLine = {
	kind: 'time';
	projectId: string;
	taskId: string | null;
	description: string;
	serviceFrom: string;
	serviceTo: string;
	minutes: number;
	unitPriceCents: bigint;
	netCents: bigint;
	taxCategory: TaxCategory;
	taxRateBp: number;
	entryIds: string[];
	derivation: InvoiceLine['derivation'];
};

function ruleOf(client: RoundingOverride, project: RoundingOverride) {
	return roundingFor(TENANT_ROUNDING, client, project).rule;
}

export function buildTimeLines(input: {
	entries: readonly UnbilledEntryRow[];
	clientId: string;
	rates: readonly BillingRate[];
	taxCategory: TaxCategory;
}): NewLine[] {
	const { entries, clientId, rates, taxCategory } = input;
	const billed: BilledEntry[] = entries.map((row) => ({
		id: row.id,
		employeeId: row.employeeId,
		clientId,
		projectId: row.projectId,
		taskId: row.taskId,
		workday: Temporal.PlainDate.from(row.workday),
		billable: isBillable(
			{ billable: row.entryBillable },
			row.taskId === null ? null : { billable: row.taskBillable },
			{ billable: row.projectBillable }
		),
		start: Temporal.Instant.from(row.startedAt),
		end: Temporal.Instant.from(row.endedAt)
	}));

	const overridesOf = (projectId: string) => {
		const row = entries.find((entry) => entry.projectId === projectId)!;
		return {
			client: { incrementMinutes: row.clientIncrement, mode: row.clientMode },
			project: { incrementMinutes: row.projectIncrement, mode: row.projectMode }
		};
	};

	const cells = aggregate(billed, {
		rates,
		rounding: (projectId) => ruleOf(overridesOf(projectId).client, overridesOf(projectId).project)
	});
	const lines = linesFromCells(cells, taxCategory);

	const repByKey = new Map<string, Cell>();
	const rawByKey = new Map<string, number>();
	for (const cell of cells) {
		if (!cell.billable || !cell.rate) continue;
		const taxRateBp = vatRateFor(taxCategory, cell.date);
		const key = [cell.projectId, cell.taskId ?? '', cell.rate.cents, taxRateBp].join('|');
		if (!repByKey.has(key)) repByKey.set(key, cell);
		rawByKey.set(key, (rawByKey.get(key) ?? 0) + cell.rawMinutes);
	}
	const timesOf = new Map(entries.map((row) => [row.id, { startedAt: row.startedAt, endedAt: row.endedAt }]));

	return lines.map((line) => {
		const key = [line.projectId, line.taskId ?? '', line.rateCents, line.taxRateBp].join('|');
		const rep = repByKey.get(key)!;
		const labels = entries.find(
			(row) => row.projectId === line.projectId && row.taskId === line.taskId
		)!;
		return {
			kind: 'time',
			projectId: line.projectId,
			taskId: line.taskId,
			description: labels.taskName ? `${labels.projectName} – ${labels.taskName}` : labels.projectName,
			serviceFrom: line.serviceFrom.toString(),
			serviceTo: line.serviceTo.toString(),
			minutes: line.minutes,
			unitPriceCents: line.rateCents,
			netCents: line.netCents,
			taxCategory: line.taxCategory,
			taxRateBp: line.taxRateBp,
			entryIds: [...line.entryIds],
			derivation: {
				entries: line.entryIds.map((id) => ({ id, ...timesOf.get(id)! })),
				rounding: {
					key: rep.rounding.key,
					params: { ...rep.rounding.params, raw: rawByKey.get(key)!, rounded: line.minutes }
				},
				rate: { cents: String(line.rateCents), explanation: rep.rate!.explanation }
			}
		};
	});
}

export { taxTreatment, toBillingRate };

export type InvoiceRowDb = {
	id: string;
	kind: 'invoice' | 'cancellation';
	status: 'draft' | 'issued' | 'paid' | 'cancelled';
	specimen: boolean;
	client_id: string;
	number: string | null;
	number_year: number | null;
	number_seq: number | null;
	issue_date: string | null;
	due_date: string | null;
	service_from: string;
	service_to: string;
	payment_terms_days: number;
	locale: string;
	format: 'pdf' | 'zugferd' | 'xrechnung';
	tax_profile: 'regular' | 'small_business';
	tax_treatment: TaxCategory | null;
	seller: unknown;
	buyer: unknown;
	intro_text: string | null;
	closing_text: string | null;
	paid_on: string | null;
	cancel_reason: string | null;
	cancelled_at: string | null;
	cancelled_by: { id: string; displayName: string } | null;
	issued_at: string | null;
	issued_by: { id: string; displayName: string } | null;
	created_by: { id: string; displayName: string } | null;
	created_at: string;
	updated_at: string;
	retain_until: string | null;
};

export type InvoiceLineRowDb = {
	id: string;
	position: number;
	kind: 'time' | 'item';
	project_id: string | null;
	task_id: string | null;
	description: string;
	service_from: string | null;
	service_to: string | null;
	minutes: number | null;
	quantity_milli: string | null;
	unit: string | null;
	unit_price_cents: string;
	net_cents: string;
	tax_category: TaxCategory;
	tax_rate_bp: number;
	exemption_reason: string | null;
	derivation: unknown;
};

export type ClientRowForInvoice = {
	name: string;
	street: string | null;
	postal_code: string | null;
	city: string | null;
	country_code: string;
	is_business: boolean;
	vat_id: string | null;
	email: string | null;
	buyer_reference: string | null;
	number: string | null;
};

type SellerSnapshot = Invoice['seller'];
type BuyerSnapshot = Invoice['buyer'];

export function liveSeller(profile: BillingProfile): SellerSnapshot {
	return {
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
	};
}

export function liveBuyer(client: ClientRowForInvoice): BuyerSnapshot {
	return {
		name: client.name,
		street: client.street,
		postalCode: client.postal_code,
		city: client.city,
		countryCode: client.country_code,
		isBusiness: client.is_business,
		vatId: client.vat_id,
		email: client.email,
		buyerReference: client.buyer_reference,
		number: client.number
	};
}

function inferTreatment(taxProfile: 'regular' | 'small_business', categories: readonly TaxCategory[]): TaxCategory {
	if (taxProfile === 'small_business') return 'small_business';
	if (categories.includes('reverse_charge')) return 'reverse_charge';
	if (categories.includes('outside_scope')) return 'outside_scope';
	return 'standard';
}

export function toLineModel(row: InvoiceLineRowDb): InvoiceLine {
	return {
		id: row.id,
		position: row.position,
		kind: row.kind,
		projectId: row.project_id,
		taskId: row.task_id,
		description: row.description,
		serviceFrom: row.service_from,
		serviceTo: row.service_to,
		minutes: row.minutes,
		quantityMilli: row.quantity_milli,
		unit: row.unit as InvoiceLine['unit'],
		unitPriceCents: row.unit_price_cents,
		netCents: row.net_cents,
		taxCategory: row.tax_category,
		taxRateBp: row.tax_rate_bp,
		exemptionReason: row.exemption_reason,
		derivation: (row.derivation as InvoiceLine['derivation'] | null) ?? {
			entries: [],
			rounding: null,
			rate: null
		}
	};
}

export function toInvoiceModel(ctx: {
	invoice: InvoiceRowDb;
	lines: readonly InvoiceLineRowDb[];
	client: ClientRowForInvoice;
	profile: BillingProfile;
	refersTo: Invoice['refersTo'];
}): Invoice {
	const { invoice, lines, client, profile, refersTo } = ctx;
	const isDraft = invoice.status === 'draft';

	const totals = invoiceTotals(
		lines.map((line) => ({
			netCents: BigInt(line.net_cents),
			taxCategory: line.tax_category,
			taxRateBp: line.tax_rate_bp
		}))
	);

	const treatment =
		invoice.tax_treatment ??
		(isDraft
			? taxTreatment(profile, {
					countryCode: client.country_code,
					isBusiness: client.is_business,
					vatId: client.vat_id
				})
			: inferTreatment(
					invoice.tax_profile,
					lines.map((line) => line.tax_category)
				));

	const seller = (invoice.seller as SellerSnapshot | null) ?? liveSeller(profile);
	const buyer = (invoice.buyer as BuyerSnapshot | null) ?? liveBuyer(client);

	const form = invoiceForm({
		kind: invoice.kind,
		format: invoice.format,
		grossCents: totals.grossCents,
		treatment,
		isBusiness: buyer.isBusiness,
		profile: { hasVatId: seller.vatId !== null, hasTaxNumber: seller.taxNumber !== null },
		seller,
		buyer: {
			...buyer,
			leitwegId: isLeitwegId(buyer)
		}
	});
	const taxBlockers = isDraft
		? [
				...taxMismatches({
					taxProfile: invoice.tax_profile,
					treatment,
					positions: lines.map((line) => ({
						position: line.position,
						kind: line.kind,
						taxCategory: line.tax_category,
						taxRateBp: line.tax_rate_bp,
						serviceDate: Temporal.PlainDate.from(
							line.kind === 'time' ? line.service_to! : invoice.service_to
						)
					}))
				}).map((mismatch) => mismatch.code),
				...(invoice.kind === 'invoice' ? totalBlockers(totals) : [])
			]
		: [];

	const locale = invoice.locale as Locale;
	const reasons = [
		...new Set(
			lines.filter((line) => line.tax_category === 'exempt').map((line) => line.exemption_reason)
		)
	];
	const noteKeys =
		reasons.length > 0 ? [...new Set([...form.legalNotes, 'exempt_reason'])] : form.legalNotes;
	const legalNotes = noteKeys.flatMap((key) =>
		key === 'exempt_reason'
			? reasons.map((reason) =>
					reason === null ? (legalNoteTexts[locale][key] ?? key) : TEXTS[locale].exemption(reason)
				)
			: [legalNoteTexts[locale][key] ?? key]
	);

	return {
		id: invoice.id,
		kind: invoice.kind,
		status: invoice.status,
		specimen: invoice.specimen,
		clientId: invoice.client_id,
		refersTo,
		number: invoice.number,
		numberYear: invoice.number_year,
		numberSeq: invoice.number_seq,
		issueDate: invoice.issue_date,
		dueDate: invoice.due_date,
		serviceFrom: invoice.service_from,
		serviceTo: invoice.service_to,
		paymentTermsDays: invoice.payment_terms_days,
		locale,
		format: invoice.format,
		taxProfile: invoice.tax_profile,
		seller,
		buyer,
		introText: invoice.intro_text,
		closingText: invoice.closing_text,
		lines: lines.map(toLineModel).toSorted((a, b) => a.position - b.position),
		taxGroups: totals.groups.map((group) => ({
			taxCategory: group.taxCategory,
			taxRateBp: group.taxRateBp,
			netCents: String(group.netCents),
			taxCents: String(group.taxCents),
			explanation: group.explanation
		})),
		totals: {
			netCents: String(totals.netCents),
			taxCents: String(totals.taxCents),
			grossCents: String(totals.grossCents),
			explanation: totals.explanation
		},
		legalNotes,
		blockers: [...new Set([...form.blockers, ...taxBlockers])],
		hints: form.hints,
		paidOn: invoice.paid_on,
		cancelReason: invoice.cancel_reason,
		cancelledAt: invoice.cancelled_at,
		cancelledBy: invoice.cancelled_by,
		issuedAt: invoice.issued_at,
		issuedBy: invoice.issued_by,
		createdBy: invoice.created_by,
		createdAt: invoice.created_at,
		updatedAt: invoice.updated_at,
		retainUntil: invoice.retain_until
	};
}

export type { Explanation };
