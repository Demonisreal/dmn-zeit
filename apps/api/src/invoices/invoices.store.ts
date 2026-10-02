import { Injectable } from '@nestjs/common';
import type {
	InvoiceFormat,
	InvoiceLineInput,
	InvoiceLineKind,
	InvoiceSummary,
	TaxCategory as SharedTaxCategory
} from '@zeit/shared';
import { sql } from 'kysely';
import type { Client } from '../common/client.decorator';
import type { TenantContext, Trx } from '../db/database';
import type { AppInvoiceFormat, AppTaxProfile } from '../db/schema.generated';
import type { InvoiceLineRowDb, InvoiceRowDb, NewLine, UnbilledEntryRow } from './drafts';

export type Cursor = { at: string; id: string };

export type ListFilter = {
	status?: readonly string[] | undefined;
	client?: string | undefined;
	from?: string | undefined;
	to?: string | undefined;
};

function userRef(id: string | null, name: string | null) {
	return id === null ? null : { id, displayName: name! };
}

function entryRowQuery(trx: Trx) {
	return trx
		.selectFrom('app.project_entries as e')
		.innerJoin('app.projects as p', 'p.id', 'e.project_id')
		.innerJoin('app.clients as c', 'c.id', 'p.client_id')
		.leftJoin('app.tasks as t', 't.id', 'e.task_id')
		.select([
			'e.id',
			'e.employee_id as employeeId',
			'e.project_id as projectId',
			'e.task_id as taskId',
			'e.workday',
			'e.started_at as startedAt',
			'e.ended_at as endedAt',
			'e.billable as entryBillable',
			't.billable as taskBillable',
			'p.billable as projectBillable',
			'p.name as projectName',
			't.name as taskName',
			'p.rounding_increment_min as projectIncrement',
			'p.rounding_mode as projectMode',
			'c.rounding_increment_min as clientIncrement',
			'c.rounding_mode as clientMode',
			'e.source'
		]);
}

function baseInvoiceQuery(trx: Trx) {
	return trx
		.selectFrom('app.invoices as i')
		.leftJoin('app.users as creator', 'creator.id', 'i.created_by')
		.leftJoin('app.users as issuer', 'issuer.id', 'i.issued_by')
		.leftJoin('app.users as canceller', 'canceller.id', 'i.cancelled_by')
		.leftJoin('app.invoices as ref', 'ref.id', 'i.refers_to_id')
		.select([
			'i.id',
			'i.kind',
			'i.status',
			'i.specimen',
			'i.client_id',
			'i.refers_to_id',
			'i.number',
			'i.number_year',
			'i.number_seq',
			'i.issue_date',
			'i.due_date',
			'i.service_from',
			'i.service_to',
			'i.payment_terms_days',
			'i.locale',
			'i.format',
			'i.tax_profile',
			'i.tax_treatment',
			'i.seller',
			'i.buyer',
			'i.intro_text',
			'i.closing_text',
			'i.paid_on',
			'i.cancel_reason',
			'i.cancelled_at',
			'i.issued_at',
			'i.created_at',
			'i.updated_at',
			'i.retain_until',
			'creator.id as createdById',
			'creator.display_name as createdByName',
			'issuer.id as issuedById',
			'issuer.display_name as issuedByName',
			'canceller.id as cancelledById',
			'canceller.display_name as cancelledByName',
			'ref.number as refersToNumber',
			'ref.issue_date as refersToIssueDate'
		]);
}

type BaseRow = Awaited<ReturnType<ReturnType<typeof baseInvoiceQuery>['executeTakeFirstOrThrow']>>;

function toInvoiceRow(row: BaseRow): InvoiceRowDb {
	return {
		...row,
		created_by: userRef(row.createdById, row.createdByName),
		issued_by: userRef(row.issuedById, row.issuedByName),
		cancelled_by: userRef(row.cancelledById, row.cancelledByName)
	};
}

@Injectable()
export class InvoicesStore {
	async get(
		trx: Trx,
		id: string
	): Promise<
		| {
				invoice: InvoiceRowDb;
				lines: InvoiceLineRowDb[];
				refersTo: { id: string; number: string | null; issueDate: string | null } | null;
		  }
		| undefined
	> {
		const row = await baseInvoiceQuery(trx).where('i.id', '=', id).executeTakeFirst();
		if (!row) return undefined;
		const lines = await trx
			.selectFrom('app.invoice_lines')
			.selectAll()
			.where('invoice_id', '=', id)
			.execute();
		return {
			invoice: toInvoiceRow(row),
			lines,
			refersTo: row.refers_to_id
				? { id: row.refers_to_id, number: row.refersToNumber, issueDate: row.refersToIssueDate }
				: null
		};
	}

	essentials(trx: Trx, id: string, options: { lock?: boolean } = {}) {
		return trx
			.selectFrom('app.invoices')
			.select([
				'id',
				'kind',
				'status',
				'number',
				'client_id as clientId',
				'service_from as serviceFrom',
				'service_to as serviceTo',
				'locale',
				'format',
				'tax_profile as taxProfile',
				'tax_treatment as taxTreatment',
				'payment_terms_days as paymentTermsDays'
			])
			.where('id', '=', id)
			.$if(options.lock === true, (qb) => qb.forUpdate())
			.executeTakeFirst();
	}

	async list(
		trx: Trx,
		filter: ListFilter,
		after: Cursor | undefined,
		limit: number
	): Promise<(InvoiceSummary & { createdAt: string })[]> {
		let query = trx
			.selectFrom('app.invoices as i')
			.innerJoin('app.clients as c', 'c.id', 'i.client_id')
			.select([
				'i.id',
				'i.kind',
				'i.status',
				'i.number',
				'i.client_id as clientId',
				'c.name as clientName',
				'i.issue_date as issueDate',
				'i.due_date as dueDate',
				'i.gross_cents as grossCents',
				'i.format',
				'i.created_at as createdAt',
				sql<boolean>`i.due_date < (now() at time zone 'Europe/Berlin')::date
					and i.status = 'issued' and i.kind = 'invoice'`.as('overdue')
			])
			.$if(filter.status !== undefined, (qb) => qb.where('i.status', 'in', filter.status! as never[]))
			.$if(filter.client !== undefined, (qb) => qb.where('i.client_id', '=', filter.client!))
			.$if(filter.from !== undefined, (qb) => qb.where('i.service_to', '>=', filter.from!))
			.$if(filter.to !== undefined, (qb) => qb.where('i.service_from', '<=', filter.to!));
		if (after) {
			query = query.where(
				sql<boolean>`(i.created_at, i.id) < (${after.at}::timestamptz, ${after.id}::uuid)`
			);
		}
		return query.orderBy('i.created_at', 'desc').orderBy('i.id', 'desc').limit(limit).execute();
	}

	clientForInvoice(trx: Trx, id: string) {
		return trx
			.selectFrom('app.clients')
			.select([
				'name',
				'street',
				'postal_code',
				'city',
				'country_code',
				'is_business',
				'vat_id',
				'email',
				'buyer_reference',
				'number',
				'invoice_format as invoiceFormat',
				'invoice_locale as invoiceLocale',
				'payment_terms_days as paymentTermsDays',
				'archived_at as archivedAt',
				'restricted_at as restrictedAt'
			])
			.where('id', '=', id)
			.executeTakeFirst();
	}

	async lockEntries(
		trx: Trx,
		clientId: string,
		range: { from: string; to: string },
		projectIds: readonly string[] | undefined
	): Promise<UnbilledEntryRow[]> {
		const locked = await trx
			.selectFrom('app.project_entries as e')
			.innerJoin('app.projects as p', 'p.id', 'e.project_id')
			.select('e.id')
			.where('p.client_id', '=', clientId)
			.where('e.invoice_id', 'is', null)
			.where('e.ended_at', 'is not', null)
			.where('e.voided_at', 'is', null)
			.where('e.workday', '>=', range.from)
			.where('e.workday', '<=', range.to)
			.$if((projectIds?.length ?? 0) > 0, (qb) => qb.where('e.project_id', 'in', projectIds!))
			.forUpdate()
			.execute();
		if (locked.length === 0) return [];

		const ids = locked.map((row) => row.id);
		return entryRowQuery(trx).where('e.id', 'in', ids).execute() as Promise<UnbilledEntryRow[]>;
	}

	async linkedEntryRows(trx: Trx, invoiceId: string): Promise<UnbilledEntryRow[]> {
		const locked = await trx
			.selectFrom('app.project_entries')
			.select('id')
			.where('invoice_id', '=', invoiceId)
			.forUpdate()
			.execute();
		if (locked.length === 0) return [];

		const ids = locked.map((row) => row.id);
		return entryRowQuery(trx).where('e.id', 'in', ids).execute() as Promise<UnbilledEntryRow[]>;
	}

	async ratesFor(trx: Trx, clientId: string) {
		return trx
			.selectFrom('app.rates')
			.selectAll()
			.where((eb) => eb.or([eb('client_id', 'is', null), eb('client_id', '=', clientId)]))
			.execute();
	}

	async insertDraft(
		trx: Trx,
		ctx: TenantContext,
		input: {
			clientId: string;
			from: string;
			to: string;
			format: AppInvoiceFormat;
			locale: string;
			taxProfile: AppTaxProfile;
			taxTreatment: SharedTaxCategory;
			paymentTermsDays: number;
			introText: string | null;
			closingText: string | null;
		}
	): Promise<string> {
		const row = await trx
			.insertInto('app.invoices')
			.values({
				tenant_id: ctx.tenantId,
				client_id: input.clientId,
				service_from: input.from,
				service_to: input.to,
				payment_terms_days: input.paymentTermsDays,
				locale: input.locale,
				format: input.format,
				tax_profile: input.taxProfile,
				tax_treatment: input.taxTreatment,
				intro_text: input.introText,
				closing_text: input.closingText,
				created_by: ctx.userId
			})
			.returning('id')
			.executeTakeFirstOrThrow();
		return row.id;
	}

	async nextPosition(trx: Trx, invoiceId: string): Promise<number> {
		const row = await trx
			.selectFrom('app.invoice_lines')
			.select((eb) => eb.fn.max<number | null>('position').as('max'))
			.where('invoice_id', '=', invoiceId)
			.executeTakeFirst();
		return (row?.max ?? 0) + 1;
	}

	async lineCount(trx: Trx, invoiceId: string): Promise<number> {
		const row = await trx
			.selectFrom('app.invoice_lines')
			.select((eb) => eb.fn.countAll<number>().as('count'))
			.where('invoice_id', '=', invoiceId)
			.executeTakeFirst();
		return Number(row?.count ?? 0);
	}

	async entryCount(trx: Trx, invoiceId: string): Promise<number> {
		const row = await trx
			.selectFrom('app.invoice_line_entries')
			.select((eb) => eb.fn.countAll<number>().as('count'))
			.where('invoice_id', '=', invoiceId)
			.executeTakeFirst();
		return Number(row?.count ?? 0);
	}

	async itemLineCount(trx: Trx, invoiceId: string): Promise<number> {
		const row = await trx
			.selectFrom('app.invoice_lines')
			.select((eb) => eb.fn.countAll<number>().as('count'))
			.where('invoice_id', '=', invoiceId)
			.where('kind', '=', 'item')
			.executeTakeFirst();
		return Number(row?.count ?? 0);
	}

	async replaceTimeLines(
		trx: Trx,
		tenantId: string,
		invoiceId: string,
		clientId: string,
		lines: readonly NewLine[]
	): Promise<void> {
		await sql`set constraints all deferred`.execute(trx);
		await trx.deleteFrom('app.invoice_lines').where('invoice_id', '=', invoiceId).where('kind', '=', 'time').execute();
		await this.insertTimeLines(trx, tenantId, invoiceId, clientId, 1, lines);
	}

	async insertTimeLines(
		trx: Trx,
		tenantId: string,
		invoiceId: string,
		clientId: string,
		startPosition: number,
		lines: readonly NewLine[]
	): Promise<void> {
		let position = startPosition;
		for (const line of lines) {
			const inserted = await trx
				.insertInto('app.invoice_lines')
				.values({
					tenant_id: tenantId,
					invoice_id: invoiceId,
					client_id: clientId,
					position: position++,
					kind: 'time',
					project_id: line.projectId,
					task_id: line.taskId,
					description: line.description,
					service_from: line.serviceFrom,
					service_to: line.serviceTo,
					minutes: line.minutes,
					unit_price_cents: line.unitPriceCents,
					net_cents: line.netCents,
					tax_category: line.taxCategory,
					tax_rate_bp: line.taxRateBp,
					derivation: JSON.stringify(line.derivation)
				})
				.returning('id')
				.executeTakeFirstOrThrow();

			if (line.entryIds.length > 0) {
				await trx
					.insertInto('app.invoice_line_entries')
					.values(
						line.entryIds.map((entryId) => ({
							tenant_id: tenantId,
							invoice_id: invoiceId,
							line_id: inserted.id,
							entry_id: entryId
						}))
					)
					.execute();
			}
		}
	}

	async linkEntries(trx: Trx, entryIds: readonly string[], invoiceId: string): Promise<void> {
		if (entryIds.length === 0) return;
		await trx
			.updateTable('app.project_entries')
			.set({ invoice_id: invoiceId })
			.where('id', 'in', entryIds)
			.execute();
	}

	async insertItemLine(
		trx: Trx,
		tenantId: string,
		invoiceId: string,
		clientId: string,
		position: number,
		input: InvoiceLineInput & { netCents: bigint; taxRateBp: number }
	) {
		return trx
			.insertInto('app.invoice_lines')
			.values({
				tenant_id: tenantId,
				invoice_id: invoiceId,
				client_id: clientId,
				position,
				kind: 'item',
				description: input.description,
				quantity_milli: input.quantityMilli,
				unit: input.unit,
				unit_price_cents: input.unitPriceCents,
				net_cents: input.netCents,
				tax_category: input.taxCategory,
				tax_rate_bp: input.taxRateBp,
				exemption_reason: input.exemptionReason ?? null
			})
			.returningAll()
			.executeTakeFirstOrThrow();
	}

	line(trx: Trx, invoiceId: string, lineId: string) {
		return trx
			.selectFrom('app.invoice_lines')
			.selectAll()
			.where('invoice_id', '=', invoiceId)
			.where('id', '=', lineId)
			.executeTakeFirst();
	}

	updateItemLine(
		trx: Trx,
		lineId: string,
		patch: {
			description?: string | undefined;
			quantity_milli?: string | undefined;
			unit?: string | undefined;
			unit_price_cents?: string | undefined;
			net_cents: bigint;
			tax_category: SharedTaxCategory;
			tax_rate_bp: number;
			exemption_reason: string | null;
		}
	) {
		return trx
			.updateTable('app.invoice_lines')
			.set(patch)
			.where('id', '=', lineId)
			.returningAll()
			.executeTakeFirst();
	}

	updateTimeLineText(trx: Trx, lineId: string, description: string) {
		return trx
			.updateTable('app.invoice_lines')
			.set({ description })
			.where('id', '=', lineId)
			.returningAll()
			.executeTakeFirst();
	}

	async deleteLine(trx: Trx, invoiceId: string, lineId: string): Promise<boolean> {
		const entries = await trx
			.selectFrom('app.invoice_line_entries')
			.select('entry_id')
			.where('invoice_id', '=', invoiceId)
			.where('line_id', '=', lineId)
			.execute();
		if (entries.length > 0) {
			await trx
				.updateTable('app.project_entries')
				.set({ invoice_id: null })
				.where(
					'id',
					'in',
					entries.map((row) => row.entry_id)
				)
				.execute();
		}
		const deleted = await trx
			.deleteFrom('app.invoice_lines')
			.where('invoice_id', '=', invoiceId)
			.where('id', '=', lineId)
			.executeTakeFirst();
		return deleted.numDeletedRows > 0n;
	}

	updateDraftMeta(
		trx: Trx,
		id: string,
		patch: Partial<{
			client_id: string;
			service_from: string;
			service_to: string;
			intro_text: string | null;
			closing_text: string | null;
			payment_terms_days: number;
			tax_treatment: SharedTaxCategory;
		}>
	) {
		return trx
			.updateTable('app.invoices')
			.set(patch)
			.where('id', '=', id)
			.returning('id')
			.executeTakeFirst();
	}

	async setDraftFormat(trx: Trx, id: string, format: AppInvoiceFormat): Promise<void> {
		await trx
			.updateTable('app.invoices')
			.set({ format })
			.where('id', '=', id)
			.where('status', '=', 'draft')
			.execute();
	}

	async deleteDraft(trx: Trx, id: string): Promise<boolean> {
		const deleted = await trx.deleteFrom('app.invoices').where('id', '=', id).executeTakeFirst();
		return deleted.numDeletedRows > 0n;
	}

	async issue(trx: Trx, id: string): Promise<{ id: string } | undefined> {
		const { rows } = await sql<{ id: string }>`select id from app.issue_invoice(${id}::uuid)`.execute(trx);
		return rows[0];
	}

	async cancel(trx: Trx, id: string, reason: string): Promise<{ id: string } | undefined> {
		const { rows } = await sql<{
			id: string;
		}>`select id from app.invoice_cancel(${id}::uuid, ${reason})`.execute(trx);
		return rows[0];
	}

	setPaid(trx: Trx, id: string, paidOn: string) {
		return trx
			.updateTable('app.invoices')
			.set({ status: 'paid', paid_on: paidOn })
			.where('id', '=', id)
			.where('status', '=', 'issued')
			.returning('id')
			.executeTakeFirst();
	}

	setUnpaid(trx: Trx, id: string) {
		return trx
			.updateTable('app.invoices')
			.set({ status: 'issued', paid_on: null })
			.where('id', '=', id)
			.where('status', '=', 'paid')
			.returning('id')
			.executeTakeFirst();
	}

	storedDocument(trx: Trx, invoiceId: string, format: string) {
		return trx
			.selectFrom('app.invoice_documents')
			.select(['content', 'sha256'])
			.where('invoice_id', '=', invoiceId)
			.where('format', '=', format)
			.executeTakeFirst();
	}

	saveDocument(trx: Trx, invoiceId: string, format: string, content: Buffer) {
		return sql`select app.store_invoice_document(${invoiceId}::uuid, ${format}, ${content})`.execute(trx);
	}

	timeReportEntries(trx: Trx, invoiceId: string) {
		return trx
			.selectFrom('app.invoice_line_entries as le')
			.innerJoin('app.project_entries as e', 'e.id', 'le.entry_id')
			.innerJoin('app.projects as p', 'p.id', 'e.project_id')
			.leftJoin('app.tasks as t', 't.id', 'e.task_id')
			.select([
				'e.workday',
				'e.started_at as startedAt',
				'e.ended_at as endedAt',
				'e.note',
				'e.billable as entryBillable',
				't.billable as taskBillable',
				'p.billable as projectBillable',
				'p.id as projectId',
				'p.name as projectName',
				'p.code as projectCode',
				't.id as taskId',
				't.name as taskName'
			])
			.where('le.invoice_id', '=', invoiceId)
			.orderBy('e.started_at')
			.execute();
	}

	lineEntrySpans(trx: Trx, invoiceId: string) {
		return trx
			.selectFrom('app.invoice_line_entries as le')
			.innerJoin('app.project_entries as e', 'e.id', 'le.entry_id')
			.select(['e.id', 'e.source', 'e.started_at as startedAt', 'e.ended_at as endedAt'])
			.where('le.invoice_id', '=', invoiceId)
			.execute();
	}

	async logEvent(
		trx: Trx,
		ctx: TenantContext,
		client: Client,
		entry: { action: string; rowId: string; diff?: Record<string, string> }
	): Promise<void> {
		await trx
			.insertInto('audit.log')
			.values({
				tenant_id: ctx.tenantId,
				actor_user_id: ctx.userId,
				actor_role: ctx.role,
				source: 'app',
				action: entry.action,
				table_name: 'invoices',
				row_id: entry.rowId,
				subject_employee_id: null,
				diff: entry.diff ?? null,
				request_id: client.requestId,
				ip: client.ip
			})
			.execute();
	}
}

export type { InvoiceFormat, InvoiceLineKind };
