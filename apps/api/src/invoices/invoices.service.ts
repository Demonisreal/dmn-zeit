import { isDeepStrictEqual } from 'node:util';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { isBillable, longTimerEntries, roundDiv, vatRateFor } from '@zeit/rules';
import { invoicePeriodIssue } from '@zeit/shared';
import type {
	ApiError,
	CancelInvoiceInput,
	CreateDraftInput,
	Invoice,
	InvoiceLine,
	InvoiceLineInput,
	InvoiceListQuery,
	InvoicePage,
	IssueInvoiceInput,
	Locale,
	MarkPaidInput,
	TaxCategory,
	TaxProfile,
	UpdateDraftInput
} from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { BillingStore } from '../billing/billing.store';
import type { Client } from '../common/client.decorator';
import { Clock } from '../common/clock';
import type { AuthSession } from '../common/session.guard';
import { Database, type Trx } from '../db/database';
import { DocumentsService } from '../documents/documents.service';
import type { TimeReport, TimeReportEntry } from '../documents/time-report';
import type { Download } from '../documents/time-report-csv';
import type { RenderedDocument } from '../documents/worker';
import { einvoiceBlockers } from '../einvoice/blockers';
import { defaultInvoiceFormat } from '../einvoice/default-format';
import { toEInvoice } from '../einvoice/from-invoice';
import { toBillingRate } from '../projects/project-engine';
import { decodeCursor, encodeCursor } from '../time/cursor';
import { localDate } from '../time/day-engine';
import { buildTimeLines, taxTreatment, toInvoiceModel, toLineModel } from './drafts';
import { InvoicesStore } from './invoices.store';
import { defaultClosingText, defaultIntroText, documentNames } from './texts';

type InvoiceFile = { content: Buffer; sha256: Buffer; filename: string };

function found<T>(row: T | undefined, what: string): T {
	if (row === undefined) throw new NotFoundException(`${what} not found`);
	return row;
}

function invalidState(message: string, details: Record<string, unknown> | null = null) {
	return new ConflictException({ code: 'INVALID_STATE', message, details } satisfies ApiError);
}

function einvoiceGaps(invoice: Invoice): string[] {
	return invoice.format === 'pdf' ? [] : einvoiceBlockers(toEInvoice(invoice), invoice.format);
}

const MAX_LINES = 500;
function tooManyLines() {
	return new BadRequestException({
		code: 'VALIDATION',
		message: 'Invalid input',
		details: [{ field: 'lines', code: 'custom', message: 'invoice.tooManyLines', params: { max: MAX_LINES } }]
	} satisfies ApiError);
}

export const MAX_ENTRIES = 5000;
function tooManyEntries() {
	return new BadRequestException({
		code: 'VALIDATION',
		message: 'Invalid input',
		details: [{ field: 'entries', code: 'custom', message: 'invoice.tooManyEntries', params: { max: MAX_ENTRIES } }]
	} satisfies ApiError);
}

function taxCategoryMismatch(category: TaxCategory) {
	return new BadRequestException({
		code: 'VALIDATION',
		message: 'Invalid input',
		details: [
			{ field: 'taxCategory', code: 'custom', message: 'invoice.taxCategoryMismatch', params: { category } }
		]
	} satisfies ApiError);
}

function invalidField(field: string, message: string) {
	return new BadRequestException({
		code: 'VALIDATION',
		message: 'Invalid input',
		details: [{ field, code: 'custom', message }]
	} satisfies ApiError);
}

function assertExemption(category: TaxCategory, reason: string | null) {
	if (category === 'exempt' && reason === null) {
		throw invalidField('exemptionReason', 'invoice.exemptionReasonRequired');
	}
	if (category !== 'exempt' && reason !== null) {
		throw invalidField('exemptionReason', 'invoice.exemptionReasonUnexpected');
	}
}

type DraftTax = { clientId: string; taxTreatment: TaxCategory | null };

function treatmentFor(
	profile: { taxProfile: TaxProfile },
	client: { country_code: string; is_business: boolean; vat_id: string | null }
): TaxCategory {
	return taxTreatment(profile, {
		countryCode: client.country_code,
		isBusiness: client.is_business,
		vatId: client.vat_id
	});
}

export type LinePatch = { [K in keyof InvoiceLineInput]?: InvoiceLineInput[K] | undefined };

function minutesOf(startedAt: string, endedAt: string): number {
	return Math.round(Temporal.Instant.from(startedAt).until(Temporal.Instant.from(endedAt)).total('minutes'));
}

@Injectable()
export class InvoicesService {
	private readonly logger = new Logger(InvoicesService.name);

	constructor(
		private readonly db: Database,
		private readonly store: InvoicesStore,
		private readonly billing: BillingStore,
		private readonly documents: DocumentsService,
		private readonly clock: Clock
	) {}

	list(session: AuthSession, query: InvoiceListQuery): Promise<InvoicePage> {
		const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
		return this.db.withTenant(session, async (trx) => {
			const rows = await this.store.list(
				trx,
				{ status: query.status, client: query.client, from: query.from, to: query.to },
				after,
				query.limit + 1
			);
			const page = rows.slice(0, query.limit);
			const last = page.at(-1);
			return {
				items: page.map(({ createdAt: _createdAt, ...summary }) => summary),
				nextCursor: last && rows.length > query.limit ? encodeCursor(last.createdAt, last.id) : null
			};
		});
	}

	get(session: AuthSession, id: string): Promise<Invoice> {
		return this.db.withTenant(session, (trx) => this.model(trx, id));
	}

	createDraft(session: AuthSession, input: CreateDraftInput, client: Client): Promise<Invoice> {
		return this.db.withTenant(session, async (trx) => {
			const clientRow = found(await this.store.clientForInvoice(trx, input.clientId), 'Client');
			const profile = await this.billing.profile(trx);

			const entries = await this.store.lockEntries(
				trx,
				input.clientId,
				{ from: input.from, to: input.to },
				input.projectIds
			);
			if (entries.length === 0) throw invalidState('No unbilled time in this period');

			const rates = await this.ratesFor(trx, input.clientId);
			const treatment = treatmentFor(profile, clientRow);
			const lines = buildTimeLines({ entries, clientId: input.clientId, rates, taxCategory: treatment });
			if (lines.length === 0) {
				throw invalidState('None of the unbilled time in this period has a rate yet');
			}
			if (lines.length > MAX_LINES) throw tooManyLines();
			const entryIds = lines.flatMap((line) => line.entryIds);
			if (entryIds.length > MAX_ENTRIES) throw tooManyEntries();

			const locale = clientRow.invoiceLocale as Locale;
			const invoiceId = await this.store.insertDraft(trx, session, {
				clientId: input.clientId,
				from: input.from,
				to: input.to,
				format: defaultInvoiceFormat({
					clientFormat: clientRow.invoiceFormat,
					isBusiness: clientRow.is_business,
					buyerReference: clientRow.buyer_reference,
					profileFormat: profile.defaultFormat
				}),
				locale,
				taxProfile: profile.taxProfile,
				taxTreatment: treatment,
				paymentTermsDays: clientRow.paymentTermsDays ?? profile.paymentTermsDays,
				introText: defaultIntroText[locale],
				closingText: defaultClosingText[locale]
			});
			await this.store.insertTimeLines(trx, session.tenantId, invoiceId, input.clientId, 1, lines);
			await this.store.linkEntries(trx, entryIds, invoiceId);
			await this.store.logEvent(trx, session, client, { action: 'invoice.draft_created', rowId: invoiceId });
			return this.model(trx, invoiceId);
		});
	}

	updateDraft(session: AuthSession, id: string, input: UpdateDraftInput): Promise<Invoice> {
		return this.db.withTenant(session, async (trx) => {
			const draft = await this.lockedDraft(trx, id);
			if (input.from !== undefined || input.to !== undefined) {
				const issue = invoicePeriodIssue({
					from: input.from ?? draft.serviceFrom,
					to: input.to ?? draft.serviceTo
				});
				if (issue !== null) throw invalidField('to', issue);
			}
			const patch: Partial<{
				client_id: string;
				service_from: string;
				service_to: string;
				intro_text: string | null;
				closing_text: string | null;
				payment_terms_days: number;
				tax_treatment: TaxCategory;
			}> = {};
			if (input.clientId !== undefined) {
				const clientRow = found(await this.store.clientForInvoice(trx, input.clientId), 'Client');
				patch.client_id = input.clientId;
				patch.tax_treatment = treatmentFor({ taxProfile: draft.taxProfile }, clientRow);
			}
			if (input.from !== undefined) patch.service_from = input.from;
			if (input.to !== undefined) patch.service_to = input.to;
			if (input.introText !== undefined) patch.intro_text = input.introText;
			if (input.closingText !== undefined) patch.closing_text = input.closingText;
			if (input.paymentTermsDays !== undefined) patch.payment_terms_days = input.paymentTermsDays;
			if (Object.keys(patch).length > 0) await this.store.updateDraftMeta(trx, id, patch);
			return this.model(trx, id);
		});
	}

	refresh(session: AuthSession, id: string): Promise<Invoice> {
		return this.db.withTenant(session, async (trx) => {
			const essentials = await this.lockedDraft(trx, id);
			const [treatment, freeEntries] = await Promise.all([
				this.treatment(trx, essentials),
				this.store.lockEntries(trx, essentials.clientId, { from: essentials.serviceFrom, to: essentials.serviceTo }, undefined)
			]);
			if (freeEntries.length === 0) return this.model(trx, id);

			const linkedEntries = await this.store.linkedEntryRows(trx, id);
			const rates = await this.ratesFor(trx, essentials.clientId);
			const lines = buildTimeLines({
				entries: [...linkedEntries, ...freeEntries],
				clientId: essentials.clientId,
				rates,
				taxCategory: treatment
			});
			if (lines.length === 0) return this.model(trx, id);

			const itemLines = await this.store.itemLineCount(trx, id);
			if (itemLines + lines.length > MAX_LINES) throw tooManyLines();
			const entryIds = lines.flatMap((line) => line.entryIds);
			if (entryIds.length > MAX_ENTRIES) throw tooManyEntries();

			await this.store.replaceTimeLines(trx, session.tenantId, id, essentials.clientId, lines);
			await this.store.linkEntries(trx, entryIds, id);
			return this.model(trx, id);
		});
	}

	addLine(session: AuthSession, id: string, input: InvoiceLineInput): Promise<InvoiceLine> {
		return this.db.withTenant(session, async (trx) => {
			const essentials = await this.lockedDraft(trx, id);
			if ((await this.store.lineCount(trx, id)) >= MAX_LINES) throw tooManyLines();
			await this.assertLineTaxCategory(trx, essentials, input.taxCategory);
			assertExemption(input.taxCategory, input.exemptionReason ?? null);
			const taxRateBp = vatRateFor(input.taxCategory, Temporal.PlainDate.from(essentials.serviceTo));
			const netCents = roundDiv(BigInt(input.quantityMilli) * BigInt(input.unitPriceCents), 1000n);
			const position = await this.store.nextPosition(trx, id);
			const row = await this.store.insertItemLine(trx, session.tenantId, id, essentials.clientId, position, {
				...input,
				netCents,
				taxRateBp
			});
			return toLineModel(row);
		});
	}

	updateLine(session: AuthSession, id: string, lineId: string, patch: LinePatch): Promise<InvoiceLine> {
		return this.db.withTenant(session, async (trx) => {
			const essentials = await this.lockedDraft(trx, id);
			const line = found(await this.store.line(trx, id, lineId), 'Invoice line');

			if (line.kind === 'time') {
				const onlyText = Object.keys(patch).every((key) => key === 'description');
				if (!onlyText) throw invalidState('Only the text of a time-based line can be changed');
				if (patch.description === undefined) return toLineModel(line);
				const updated = found(await this.store.updateTimeLineText(trx, lineId, patch.description), 'Invoice line');
				return toLineModel(updated);
			}

			if (patch.taxCategory !== undefined) {
				await this.assertLineTaxCategory(trx, essentials, patch.taxCategory);
			}
			const quantityMilli = patch.quantityMilli ?? line.quantity_milli!;
			const unitPriceCents = patch.unitPriceCents ?? line.unit_price_cents;
			const taxCategory = patch.taxCategory ?? line.tax_category;
			const exemptionReason =
				taxCategory === 'exempt'
					? (patch.exemptionReason ?? line.exemption_reason)
					: (patch.exemptionReason ?? null);
			assertExemption(taxCategory, exemptionReason);
			const referenceDate = Temporal.PlainDate.from(essentials.serviceTo);
			const updated = found(
				await this.store.updateItemLine(trx, lineId, {
					description: patch.description,
					quantity_milli: patch.quantityMilli,
					unit: patch.unit,
					unit_price_cents: patch.unitPriceCents,
					net_cents: roundDiv(BigInt(quantityMilli) * BigInt(unitPriceCents), 1000n),
					tax_category: taxCategory,
					tax_rate_bp: vatRateFor(taxCategory, referenceDate),
					exemption_reason: exemptionReason
				}),
				'Invoice line'
			);
			return toLineModel(updated);
		});
	}

	deleteLine(session: AuthSession, id: string, lineId: string): Promise<void> {
		return this.db.withTenant(session, async (trx) => {
			await this.lockedDraft(trx, id);
			if (!(await this.store.deleteLine(trx, id, lineId))) throw new NotFoundException('Invoice line not found');
		});
	}

	deleteDraft(session: AuthSession, id: string): Promise<void> {
		return this.db.withTenant(session, async (trx) => {
			await this.lockedDraft(trx, id);
			await this.store.deleteDraft(trx, id);
		});
	}

	async previewPdf(session: AuthSession, id: string): Promise<Buffer> {
		const model = await this.db.withTenant(session, (trx) => this.model(trx, id));
		if (model.status !== 'draft') throw invalidState('Only a draft has a preview');
		return this.documents.renderInvoicePdf(model);
	}

	async issue(session: AuthSession, id: string, input: IssueInvoiceInput, client: Client): Promise<Invoice> {
		const checked = await this.db.withTenant(session, async (trx) => {
			await this.lockedDraft(trx, id);
			if ((await this.store.entryCount(trx, id)) > MAX_ENTRIES) throw tooManyEntries();
			await this.store.setDraftFormat(trx, id, input.format);
			const draft = await this.model(trx, id);
			const blockers =
				draft.hints.includes('long_timer_entry') && !input.longTimersChecked
					? [...draft.blockers, 'long_timer_entry']
					: draft.blockers;
			if (blockers.length > 0) throw invalidState('This invoice is missing required fields', { blockers });
			return draft;
		});
		await this.documents.renderInvoicePdf(checked);
		const model = await this.db.withTenant(session, async (trx) => {
			await this.lockedDraft(trx, id);
			if (!isDeepStrictEqual(await this.model(trx, id), checked)) {
				throw invalidState('The draft changed while it was being checked');
			}
			if (!(await this.store.issue(trx, id))) throw invalidState('The invoice is no longer a draft');
			await this.store.logEvent(trx, session, client, { action: 'invoice.issued', rowId: id, diff: { format: input.format } });
			return this.model(trx, id);
		});
		await this.renderAndStore(session, model);
		return model;
	}

	async cancel(session: AuthSession, id: string, input: CancelInvoiceInput, client: Client): Promise<Invoice> {
		const cancellation = await this.db.withTenant(session, async (trx) => {
			const row = await this.store.cancel(trx, id, input.reason);
			if (!row) throw invalidState('This invoice cannot be cancelled');
			const created = await this.model(trx, row.id);
			const blockers = einvoiceGaps(created);
			if (blockers.length > 0) {
				throw invalidState('This cancellation is missing required fields', { blockers });
			}
			await this.store.logEvent(trx, session, client, {
				action: 'invoice.cancelled',
				rowId: id,
				diff: { cancellationId: row.id, reason: input.reason }
			});
			return created;
		});
		await this.renderAndStore(session, cancellation);
		return cancellation;
	}

	markPaid(session: AuthSession, id: string, input: MarkPaidInput, client: Client): Promise<Invoice> {
		if (input.paidOn > localDate(this.clock.now())) throw invalidField('paidOn', 'invoice.paidOnFuture');
		return this.db.withTenant(session, async (trx) => {
			const essentials = found(await this.store.essentials(trx, id), 'Invoice');
			if (essentials.kind === 'cancellation') throw invalidState('A cancellation is never paid');
			if (essentials.status !== 'issued' || !(await this.store.setPaid(trx, id, input.paidOn))) {
				throw invalidState('Only an issued invoice can be marked paid');
			}
			await this.store.logEvent(trx, session, client, { action: 'invoice.paid', rowId: id, diff: { paidOn: input.paidOn } });
			return this.model(trx, id);
		});
	}

	markUnpaid(session: AuthSession, id: string, client: Client): Promise<Invoice> {
		return this.db.withTenant(session, async (trx) => {
			const essentials = found(await this.store.essentials(trx, id), 'Invoice');
			if (essentials.status !== 'paid' || !(await this.store.setUnpaid(trx, id))) {
				throw invalidState('Only a paid invoice can be marked unpaid again');
			}
			await this.store.logEvent(trx, session, client, { action: 'invoice.unpaid', rowId: id });
			return this.model(trx, id);
		});
	}

	async document(session: AuthSession, id: string): Promise<InvoiceFile> {
		const essentials = found(await this.db.withTenant(session, (trx) => this.store.essentials(trx, id)), 'Invoice');
		if (essentials.status === 'draft') throw new NotFoundException('Invoice document not found');
		return this.file(session, essentials, essentials.format === 'zugferd' ? 'zugferd' : 'pdf');
	}

	async xml(session: AuthSession, id: string): Promise<InvoiceFile> {
		const essentials = found(await this.db.withTenant(session, (trx) => this.store.essentials(trx, id)), 'Invoice');
		if (essentials.status === 'draft' || essentials.format !== 'xrechnung') {
			throw new NotFoundException('Invoice XML not found');
		}
		return this.file(session, essentials, 'xrechnung_cii');
	}

	private async file(
		session: AuthSession,
		essentials: { id: string; kind: Invoice['kind']; number: string | null; locale: string },
		format: 'pdf' | 'zugferd' | 'xrechnung_cii'
	): Promise<InvoiceFile> {
		const name = documentNames[essentials.locale as Locale][essentials.kind];
		const filename = `${name}-${essentials.number!.replace(/[^\w-]/g, '_')}.${format === 'xrechnung_cii' ? 'xml' : 'pdf'}`;

		const stored = await this.db.withTenant(session, (trx) => this.store.storedDocument(trx, essentials.id, format));
		if (stored) return { ...stored, filename };

		const model = await this.db.withTenant(session, (trx) => this.model(trx, essentials.id));
		const rendered = await this.documents.renderInvoice(model);
		const saved = await this.db.withTenant(session, async (trx) => {
			await this.saveDocuments(trx, model.id, rendered);
			return this.store.storedDocument(trx, model.id, format);
		});
		return { ...found(saved, 'Invoice document'), filename };
	}

	async timeReport(session: AuthSession, id: string, format: 'pdf' | 'csv'): Promise<Buffer | Download> {
		const report = await this.db.withTenant(session, (trx) => this.timeReportOf(trx, id));
		return format === 'pdf' ? this.documents.renderTimeReportPdf(report) : this.documents.renderTimeReportCsv(report);
	}

	private async renderAndStore(session: AuthSession, model: Invoice): Promise<void> {
		try {
			const rendered = await this.documents.renderInvoice(model);
			await this.db.withTenant(session, (trx) => this.saveDocuments(trx, model.id, rendered));
		} catch (error) {
			this.logger.warn(`Could not render invoice ${model.id} after issuing: ${String(error)}`);
		}
	}

	private async saveDocuments(trx: Trx, invoiceId: string, rendered: RenderedDocument[]) {
		for (const { format, content } of rendered) {
			await this.store.saveDocument(trx, invoiceId, format, content);
		}
	}

	private async ratesFor(trx: Trx, clientId: string) {
		const rows = await this.store.ratesFor(trx, clientId);
		return rows.map((rate) =>
			toBillingRate({
				id: rate.id,
				clientId: rate.client_id,
				projectId: rate.project_id,
				taskId: rate.task_id,
				employeeId: rate.employee_id,
				validFrom: rate.valid_from,
				rateCents: rate.rate_cents,
				createdBy: rate.created_by
			})
		);
	}

	private async assertLineTaxCategory(trx: Trx, draft: DraftTax, category: TaxCategory): Promise<void> {
		const treatment = await this.treatment(trx, draft);
		const wholeInvoiceCategories: TaxCategory[] = ['reverse_charge', 'outside_scope', 'small_business'];
		const mismatch =
			treatment === 'standard' ? wholeInvoiceCategories.includes(category) : category !== treatment;
		if (mismatch) throw taxCategoryMismatch(category);
	}

	private async timeReportOf(trx: Trx, id: string): Promise<TimeReport> {
		const model = await this.model(trx, id);
		const rows = await this.store.timeReportEntries(trx, id);
		const [first] = rows;
		const projectIds = new Set(rows.map((row) => row.projectId));

		const entries: TimeReportEntry[] = rows.map((row) => ({
			date: row.workday,
			projectName: row.projectName,
			taskName: row.taskName,
			note: row.note,
			minutes: minutesOf(row.startedAt, row.endedAt!),
			billable: isBillable(
				{ billable: row.entryBillable },
				row.taskId === null ? null : { billable: row.taskBillable },
				{ billable: row.projectBillable }
			)
		}));

		return {
			locale: model.locale,
			specimen: model.specimen,
			client: { name: model.buyer.name, number: model.buyer.number },
			project: projectIds.size === 1 && first ? { name: first.projectName, code: first.projectCode ?? '' } : null,
			period: { from: model.serviceFrom, to: model.serviceTo },
			generatedAt: new Date().toISOString(),
			entries,
			totals: {
				minutes: entries.reduce((sum, entry) => sum + entry.minutes, 0),
				billableMinutes: entries.filter((entry) => entry.billable).reduce((sum, entry) => sum + entry.minutes, 0)
			}
		};
	}

	private async model(trx: Trx, id: string): Promise<Invoice> {
		const row = found(await this.store.get(trx, id), 'Invoice');
		const [clientRow, profile] = await Promise.all([
			this.store.clientForInvoice(trx, row.invoice.client_id).then((client) => found(client, 'Client')),
			this.billing.profile(trx)
		]);
		const invoice = toInvoiceModel({ ...row, client: clientRow, profile });
		if (invoice.status !== 'draft') return invoice;
		const spans = await this.store.lineEntrySpans(trx, id);
		const longTimers = longTimerEntries(
			spans.map((span) => ({
				id: span.id,
				source: span.source,
				start: Temporal.Instant.from(span.startedAt),
				end: Temporal.Instant.from(span.endedAt!)
			}))
		);
		return {
			...invoice,
			blockers: [...new Set([...invoice.blockers, ...einvoiceGaps(invoice)])],
			hints: longTimers.length > 0 ? [...invoice.hints, 'long_timer_entry'] : invoice.hints
		};
	}

	private async treatment(trx: Trx, draft: DraftTax): Promise<TaxCategory> {
		if (draft.taxTreatment !== null) return draft.taxTreatment;
		const [clientRow, profile] = await Promise.all([
			this.store.clientForInvoice(trx, draft.clientId).then((row) => found(row, 'Client')),
			this.billing.profile(trx)
		]);
		return treatmentFor(profile, clientRow);
	}

	private async lockedDraft(trx: Trx, id: string) {
		const essentials = found(await this.store.essentials(trx, id, { lock: true }), 'Invoice');
		if (essentials.status !== 'draft') throw invalidState('The invoice is no longer a draft');
		return essentials;
	}
}
