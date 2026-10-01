import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { isBillable, roundDiv, vatRateFor } from '@zeit/rules';
import type {
	ApiError,
	CancelInvoiceInput,
	CreateDraftInput,
	Invoice,
	InvoiceLine,
	InvoiceLineInput,
	InvoiceListQuery,
	InvoicePage,
	Locale,
	MarkPaidInput,
	TaxCategory,
	UpdateDraftInput
} from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { BillingStore } from '../billing/billing.store';
import type { Client } from '../common/client.decorator';
import type { AuthSession } from '../common/session.guard';
import { Database, type Trx } from '../db/database';
import { DocumentsService } from '../documents/documents.service';
import type { TimeReport, TimeReportEntry } from '../documents/time-report';
import type { Download } from '../documents/time-report-csv';
import { toBillingRate } from '../projects/project-engine';
import { decodeCursor, encodeCursor } from '../time/cursor';
import { buildTimeLines, taxTreatment, toInvoiceModel, toLineModel } from './drafts';
import { InvoicesStore } from './invoices.store';
import { defaultClosingText, defaultIntroText } from './texts';

function found<T>(row: T | undefined, what: string): T {
	if (row === undefined) throw new NotFoundException(`${what} not found`);
	return row;
}

function invalidState(message: string, details: Record<string, unknown> | null = null) {
	return new ConflictException({ code: 'INVALID_STATE', message, details } satisfies ApiError);
}

// D-01: at most 500 lines per draft, past that rendering turns into a page battle
const MAX_LINES = 500;
function tooManyLines() {
	return new BadRequestException({
		code: 'VALIDATION',
		message: 'Invalid input',
		details: [{ field: 'lines', code: 'custom', message: 'invoice.tooManyLines', params: { max: MAX_LINES } }]
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

// zod's .partial() keeps every key as "present but possibly undefined", unlike TS's own Partial<T>
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
		private readonly documents: DocumentsService
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
			const treatment = taxTreatment(profile, {
				countryCode: clientRow.country_code,
				isBusiness: clientRow.is_business,
				vatId: clientRow.vat_id
			});
			const lines = buildTimeLines({ entries, clientId: input.clientId, rates, taxCategory: treatment });
			if (lines.length === 0) {
				throw invalidState('None of the unbilled time in this period has a rate yet');
			}
			if (lines.length > MAX_LINES) throw tooManyLines();

			const locale = clientRow.invoiceLocale as Locale;
			const invoiceId = await this.store.insertDraft(trx, session, {
				clientId: input.clientId,
				from: input.from,
				to: input.to,
				format: clientRow.invoiceFormat ?? profile.defaultFormat,
				locale,
				taxProfile: profile.taxProfile,
				paymentTermsDays: clientRow.paymentTermsDays ?? profile.paymentTermsDays,
				introText: defaultIntroText[locale],
				closingText: defaultClosingText[locale]
			});
			await this.store.insertTimeLines(trx, session.tenantId, invoiceId, input.clientId, 1, lines);
			await this.store.linkEntries(trx, lines.flatMap((line) => line.entryIds), invoiceId);
			await this.store.logEvent(trx, session, client, { action: 'invoice.draft_created', rowId: invoiceId });
			return this.model(trx, invoiceId);
		});
	}

	updateDraft(session: AuthSession, id: string, input: UpdateDraftInput): Promise<Invoice> {
		return this.db.withTenant(session, async (trx) => {
			found(await this.store.essentials(trx, id), 'Invoice');
			const patch: Partial<{
				client_id: string;
				service_from: string;
				service_to: string;
				intro_text: string | null;
				closing_text: string | null;
				payment_terms_days: number;
			}> = {};
			if (input.clientId !== undefined) patch.client_id = input.clientId;
			if (input.from !== undefined) patch.service_from = input.from;
			if (input.to !== undefined) patch.service_to = input.to;
			if (input.introText !== undefined) patch.intro_text = input.introText;
			if (input.closingText !== undefined) patch.closing_text = input.closingText;
			if (input.paymentTermsDays !== undefined) patch.payment_terms_days = input.paymentTermsDays;
			if (Object.keys(patch).length > 0) await this.store.updateDraftMeta(trx, id, patch);
			return this.model(trx, id);
		});
	}

	// picks up time that became unbilled after the draft was created, in the same period and client;
	// a project filter given at creation is not persisted on the invoice, so a refresh looks at all projects
	refresh(session: AuthSession, id: string): Promise<Invoice> {
		return this.db.withTenant(session, async (trx) => {
			const essentials = found(await this.store.essentials(trx, id), 'Invoice');
			const [clientRow, profile, freeEntries] = await Promise.all([
				this.store.clientForInvoice(trx, essentials.clientId).then((row) => found(row, 'Client')),
				this.billing.profile(trx),
				this.store.lockEntries(trx, essentials.clientId, { from: essentials.serviceFrom, to: essentials.serviceTo }, undefined)
			]);
			if (freeEntries.length === 0) return this.model(trx, id);

			// the draft's own time lines are rebuilt together with the newly found time, so a cell that
			// already has a line (e.g. the same day, project and rate) is rounded once, not twice
			const linkedEntries = await this.store.linkedEntryRows(trx, id);
			const rates = await this.ratesFor(trx, essentials.clientId);
			const treatment = taxTreatment(profile, {
				countryCode: clientRow.country_code,
				isBusiness: clientRow.is_business,
				vatId: clientRow.vat_id
			});
			const lines = buildTimeLines({
				entries: [...linkedEntries, ...freeEntries],
				clientId: essentials.clientId,
				rates,
				taxCategory: treatment
			});
			if (lines.length === 0) return this.model(trx, id);

			const itemLines = await this.store.itemLineCount(trx, id);
			if (itemLines + lines.length > MAX_LINES) throw tooManyLines();

			await this.store.replaceTimeLines(trx, session.tenantId, id, essentials.clientId, lines);
			await this.store.linkEntries(trx, lines.flatMap((line) => line.entryIds), id);
			return this.model(trx, id);
		});
	}

	addLine(session: AuthSession, id: string, input: InvoiceLineInput): Promise<InvoiceLine> {
		return this.db.withTenant(session, async (trx) => {
			const essentials = found(await this.store.essentials(trx, id), 'Invoice');
			if ((await this.store.lineCount(trx, id)) >= MAX_LINES) throw tooManyLines();
			await this.assertLineTaxCategory(trx, essentials.clientId, input.taxCategory);
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
			const essentials = found(await this.store.essentials(trx, id), 'Invoice');
			const line = found(await this.store.line(trx, id, lineId), 'Invoice line');

			if (line.kind === 'time') {
				const onlyText = Object.keys(patch).every((key) => key === 'description');
				if (!onlyText) throw invalidState('Only the text of a time-based line can be changed');
				if (patch.description === undefined) return toLineModel(line);
				const updated = found(await this.store.updateTimeLineText(trx, lineId, patch.description), 'Invoice line');
				return toLineModel(updated);
			}

			if (patch.taxCategory !== undefined) {
				await this.assertLineTaxCategory(trx, essentials.clientId, patch.taxCategory);
			}
			const quantityMilli = patch.quantityMilli ?? line.quantity_milli!;
			const unitPriceCents = patch.unitPriceCents ?? line.unit_price_cents;
			const taxCategory = patch.taxCategory ?? line.tax_category;
			const referenceDate = Temporal.PlainDate.from(essentials.serviceTo);
			const updated = found(
				await this.store.updateItemLine(trx, lineId, {
					description: patch.description,
					quantity_milli: patch.quantityMilli,
					unit: patch.unit,
					unit_price_cents: patch.unitPriceCents,
					net_cents: roundDiv(BigInt(quantityMilli) * BigInt(unitPriceCents), 1000n),
					tax_category: taxCategory,
					tax_rate_bp: vatRateFor(taxCategory, referenceDate)
				}),
				'Invoice line'
			);
			return toLineModel(updated);
		});
	}

	deleteLine(session: AuthSession, id: string, lineId: string): Promise<void> {
		return this.db.withTenant(session, async (trx) => {
			if (!(await this.store.deleteLine(trx, id, lineId))) throw new NotFoundException('Invoice line not found');
		});
	}

	deleteDraft(session: AuthSession, id: string): Promise<void> {
		return this.db.withTenant(session, async (trx) => {
			if (!(await this.store.deleteDraft(trx, id))) throw new NotFoundException('Invoice not found');
		});
	}

	async previewPdf(session: AuthSession, id: string): Promise<Buffer> {
		const model = await this.db.withTenant(session, (trx) => this.model(trx, id));
		return this.documents.renderInvoicePdf(model);
	}

	async issue(session: AuthSession, id: string, format: string, client: Client): Promise<Invoice> {
		const model = await this.db.withTenant(session, async (trx) => {
			const draft = await this.model(trx, id);
			if (draft.blockers.length > 0) {
				throw invalidState('This invoice is missing required fields', { blockers: draft.blockers });
			}
			await this.store.issue(trx, id);
			await this.store.logEvent(trx, session, client, { action: 'invoice.issued', rowId: id, diff: { format } });
			return this.model(trx, id);
		});
		// 10e docks in here for zugferd/xrechnung; until then those formats stay "pending" like a failed render
		if (model.format === 'pdf') await this.renderAndStore(session, model);
		return model;
	}

	async cancel(session: AuthSession, id: string, input: CancelInvoiceInput, client: Client): Promise<Invoice> {
		const cancellation = await this.db.withTenant(session, async (trx) => {
			const row = await this.store.cancel(trx, id, input.reason);
			await this.store.logEvent(trx, session, client, {
				action: 'invoice.cancelled',
				rowId: id,
				diff: { cancellationId: row.id, reason: input.reason }
			});
			return this.model(trx, row.id);
		});
		if (cancellation.format === 'pdf') await this.renderAndStore(session, cancellation);
		return cancellation;
	}

	markPaid(session: AuthSession, id: string, input: MarkPaidInput, client: Client): Promise<Invoice> {
		return this.db.withTenant(session, async (trx) => {
			const essentials = found(await this.store.essentials(trx, id), 'Invoice');
			if (essentials.status !== 'issued') throw invalidState('Only an issued invoice can be marked paid');
			await this.store.setPaid(trx, id, input.paidOn);
			await this.store.logEvent(trx, session, client, { action: 'invoice.paid', rowId: id, diff: { paidOn: input.paidOn } });
			return this.model(trx, id);
		});
	}

	markUnpaid(session: AuthSession, id: string, client: Client): Promise<Invoice> {
		return this.db.withTenant(session, async (trx) => {
			const essentials = found(await this.store.essentials(trx, id), 'Invoice');
			if (essentials.status !== 'paid') throw invalidState('Only a paid invoice can be marked unpaid again');
			await this.store.setUnpaid(trx, id);
			await this.store.logEvent(trx, session, client, { action: 'invoice.unpaid', rowId: id });
			return this.model(trx, id);
		});
	}

	async document(session: AuthSession, id: string): Promise<{ content: Buffer; sha256: Buffer; filename: string }> {
		const essentials = found(await this.db.withTenant(session, (trx) => this.store.essentials(trx, id)), 'Invoice');
		if (essentials.status === 'draft' || essentials.format !== 'pdf') {
			throw new NotFoundException('Invoice document not found');
		}
		const filename = `${(essentials.number ?? id).replace(/[^\w-]/g, '_')}.pdf`;

		const stored = await this.db.withTenant(session, (trx) => this.store.storedDocument(trx, id, 'pdf'));
		if (stored) return { ...stored, filename };

		// R-06: rendered from the frozen snapshot on the invoice, never re-read from clients/billing_profiles
		const model = await this.db.withTenant(session, (trx) => this.model(trx, id));
		const content = await this.documents.renderInvoicePdf(model);
		try {
			const saved = found(
				await this.db.withTenant(session, (trx) =>
					this.store.saveDocument(trx, session.tenantId, id, 'pdf', content, session.userId)
				),
				'Invoice document'
			);
			return { ...saved, filename };
		} catch (error) {
			// unique (tenant_id, invoice_id, format): a concurrent request already saved one
			const race = await this.db.withTenant(session, (trx) => this.store.storedDocument(trx, id, 'pdf'));
			if (race) return { ...race, filename };
			throw error;
		}
	}

	async timeReport(session: AuthSession, id: string, format: 'pdf' | 'csv'): Promise<Buffer | Download> {
		const report = await this.db.withTenant(session, (trx) => this.timeReportOf(trx, id));
		return format === 'pdf' ? this.documents.renderTimeReportPdf(report) : this.documents.renderTimeReportCsv(report);
	}

	private async renderAndStore(session: AuthSession, model: Invoice): Promise<void> {
		try {
			const content = await this.documents.renderInvoicePdf(model);
			await this.db.withTenant(session, (trx) =>
				this.store.saveDocument(trx, session.tenantId, model.id, 'pdf', content, session.userId)
			);
		} catch (error) {
			// the number is already assigned, the document is only its rendering and is retried lazily
			// on the next GET /invoices/:id/document (planung-projekte.md, Ablauf beim Ausstellen)
			this.logger.warn(`Could not render invoice ${model.id} after issuing: ${String(error)}`);
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

	// a free position must not carry a category the client and profile rule out for the whole
	// invoice (planung-projekte.md, Risiko 17); the client already offers only the matching choices,
	// this is the server-side backstop
	private async assertLineTaxCategory(trx: Trx, clientId: string, category: TaxCategory): Promise<void> {
		const [client, profile] = await Promise.all([
			this.store.clientForInvoice(trx, clientId).then((row) => found(row, 'Client')),
			this.billing.profile(trx)
		]);
		const treatment = taxTreatment(profile, {
			countryCode: client.country_code,
			isBusiness: client.is_business,
			vatId: client.vat_id
		});
		// reverse_charge, outside_scope and small_business bind the whole invoice; only under
		// 'standard' can a position pick its own category (standard, reduced or exempt)
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
		return toInvoiceModel({ ...row, client: clientRow, profile });
	}
}
