import { Injectable } from '@nestjs/common';
import { aggregate, isBillable, roundDiv, roundingFor } from '@zeit/rules';
import type { ProjectEntry as BilledEntry } from '@zeit/rules';
import type { BillingProfile, Locale, UpdateBillingProfileInput, Unbilled } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import type { Client } from '../common/client.decorator';
import type { TenantContext, Trx } from '../db/database';
import { TENANT_ROUNDING, toBillingRate } from '../projects/project-engine';

export const DEFAULT_PROFILE: BillingProfile = {
	legalName: '',
	street: null,
	postalCode: null,
	city: null,
	countryCode: 'DE',
	taxNumber: null,
	vatId: null,
	taxProfile: 'regular',
	previousYearRevenueCents: null,
	iban: null,
	bic: null,
	bankName: null,
	contactName: null,
	contactEmail: null,
	contactPhone: null,
	registerCourt: null,
	registerNumber: null,
	invoicePrefix: '',
	paymentTermsDays: 14,
	roundingIncrementMin: 15,
	roundingMode: 'up',
	defaultFormat: 'pdf'
};

export type ProfileRow = Awaited<ReturnType<BillingStore['row']>>;

export type Admin = { id: string; email: string; displayName: string; locale: Locale };

function toProfile(row: NonNullable<ProfileRow>): BillingProfile {
	return {
		legalName: row.legal_name,
		street: row.street,
		postalCode: row.postal_code,
		city: row.city,
		countryCode: 'DE',
		taxNumber: row.tax_number,
		vatId: row.vat_id,
		taxProfile: row.tax_profile,
		previousYearRevenueCents: row.previous_year_revenue_cents,
		iban: row.iban,
		bic: row.bic,
		bankName: row.bank_name,
		contactName: row.contact_name,
		contactEmail: row.contact_email,
		contactPhone: row.contact_phone,
		registerCourt: row.register_court,
		registerNumber: row.register_number,
		invoicePrefix: row.invoice_prefix,
		paymentTermsDays: row.payment_terms_days,
		roundingIncrementMin: row.rounding_increment_min as BillingProfile['roundingIncrementMin'],
		roundingMode: row.rounding_mode,
		defaultFormat: row.default_format
	};
}

function profileColumns(input: UpdateBillingProfileInput) {
	return {
		legal_name: input.legalName,
		street: input.street,
		postal_code: input.postalCode,
		city: input.city,
		tax_number: input.taxNumber,
		vat_id: input.vatId,
		tax_profile: input.taxProfile,
		previous_year_revenue_cents: input.previousYearRevenueCents,
		iban: input.iban,
		bic: input.bic,
		bank_name: input.bankName,
		contact_name: input.contactName,
		contact_email: input.contactEmail,
		contact_phone: input.contactPhone,
		register_court: input.registerCourt,
		register_number: input.registerNumber,
		invoice_prefix: input.invoicePrefix,
		payment_terms_days: input.paymentTermsDays,
		rounding_increment_min: input.roundingIncrementMin,
		rounding_mode: input.roundingMode,
		default_format: input.defaultFormat
	};
}

@Injectable()
export class BillingStore {
	row(trx: Trx) {
		return trx.selectFrom('app.billing_profiles').selectAll().executeTakeFirst();
	}

	async profile(trx: Trx): Promise<BillingProfile> {
		const row = await this.row(trx);
		return row ? toProfile(row) : DEFAULT_PROFILE;
	}

	async isSandbox(trx: Trx): Promise<boolean> {
		const tenant = await trx.selectFrom('app.tenants').select('kind').executeTakeFirstOrThrow();
		return tenant.kind === 'sandbox';
	}

	async upsert(
		trx: Trx,
		tenantId: string,
		input: UpdateBillingProfileInput
	): Promise<BillingProfile> {
		const columns = profileColumns(input);
		const row = await trx
			.insertInto('app.billing_profiles')
			.values({ tenant_id: tenantId, ...columns })
			.onConflict((oc) => oc.column('tenant_id').doUpdateSet(columns))
			.returningAll()
			.executeTakeFirstOrThrow();
		return toProfile(row);
	}

	async admins(trx: Trx): Promise<Admin[]> {
		const rows = await trx
			.selectFrom('app.users')
			.select(['id', 'email', 'display_name as displayName', 'locale'])
			.where('role', '=', 'admin')
			.where('status', '=', 'active')
			.execute();
		return rows.map((row) => ({ ...row, locale: row.locale as Locale }));
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
				table_name: 'billing_profiles',
				row_id: entry.rowId,
				subject_employee_id: null,
				diff: entry.diff ?? null,
				request_id: client.requestId,
				ip: client.ip
			})
			.execute();
	}

	async unbilled(
		trx: Trx,
		filter: { client?: string | undefined; to?: string | undefined }
	): Promise<Unbilled> {
		const rows = await trx
			.selectFrom('app.project_entries as e')
			.innerJoin('app.projects as p', 'p.id', 'e.project_id')
			.innerJoin('app.clients as c', 'c.id', 'p.client_id')
			.leftJoin('app.tasks as t', 't.id', 'e.task_id')
			.select([
				'e.id',
				'e.employee_id as employeeId',
				'p.client_id as clientId',
				'c.name as clientName',
				'e.project_id as projectId',
				'e.task_id as taskId',
				'e.workday',
				'e.started_at as startedAt',
				'e.ended_at as endedAt',
				'e.billable as entryBillable',
				't.billable as taskBillable',
				'p.billable as projectBillable',
				'p.rounding_increment_min as projectIncrement',
				'p.rounding_mode as projectMode',
				'c.rounding_increment_min as clientIncrement',
				'c.rounding_mode as clientMode'
			])
			.where('e.invoice_id', 'is', null)
			.where('e.ended_at', 'is not', null)
			.where('e.voided_at', 'is', null)
			.$if(filter.client !== undefined, (qb) => qb.where('p.client_id', '=', filter.client!))
			.$if(filter.to !== undefined, (qb) => qb.where('e.workday', '<=', filter.to!))
			.execute();
		if (rows.length === 0) return [];

		const clientIds = [...new Set(rows.map((row) => row.clientId))];
		const rates = await trx
			.selectFrom('app.rates')
			.selectAll()
			.where((eb) => eb.or([eb('client_id', 'is', null), eb('client_id', 'in', clientIds)]))
			.execute();
		const billingRates = rates.map((rate) =>
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

		const catalog = new Map(
			rows.map((row) => [
				row.projectId,
				{
					client: { incrementMinutes: row.clientIncrement, mode: row.clientMode },
					project: { incrementMinutes: row.projectIncrement, mode: row.projectMode }
				}
			])
		);

		const billed: BilledEntry[] = rows.map((row) => ({
			id: row.id,
			employeeId: row.employeeId,
			clientId: row.clientId,
			projectId: row.projectId,
			taskId: row.taskId,
			workday: Temporal.PlainDate.from(row.workday),
			billable: isBillable(
				{ billable: row.entryBillable },
				row.taskId === null ? null : { billable: row.taskBillable },
				{ billable: row.projectBillable }
			),
			start: Temporal.Instant.from(row.startedAt),
			end: Temporal.Instant.from(row.endedAt!)
		}));

		const cells = aggregate(billed, {
			rates: billingRates,
			rounding: (projectId) => {
				const overrides = catalog.get(projectId)!;
				return roundingFor(TENANT_ROUNDING, overrides.client, overrides.project).rule;
			}
		});

		const clientNames = new Map(rows.map((row) => [row.clientId, row.clientName]));
		const perClient = new Map<
			string,
			{ minutes: number; cents: bigint; hasRate: boolean; oldestDay: string }
		>();
		for (const cell of cells) {
			if (!cell.billable) continue;
			const open = perClient.get(cell.clientId) ?? {
				minutes: 0,
				cents: 0n,
				hasRate: false,
				oldestDay: cell.date.toString()
			};
			open.minutes += cell.roundedMinutes;
			if (cell.rate) {
				open.cents += roundDiv(BigInt(cell.roundedMinutes) * cell.rate.cents, 60n);
				open.hasRate = true;
			}
			if (cell.date.toString() < open.oldestDay) open.oldestDay = cell.date.toString();
			perClient.set(cell.clientId, open);
		}

		return [...perClient.entries()]
			.map(([clientId, open]) => ({
				clientId,
				clientName: clientNames.get(clientId)!,
				minutes: open.minutes,
				amountCents: open.hasRate ? String(open.cents) : null,
				oldestDay: open.oldestDay
			}))
			.sort((a, b) => a.clientName.localeCompare(b.clientName));
	}

	async issuedThisYear(trx: Trx, year: number): Promise<bigint> {
		const rows = await trx
			.selectFrom('app.invoices')
			.select('gross_cents')
			.where('number_year', '=', year)
			.where('status', '<>', 'draft')
			.execute();
		return rows.reduce((sum, row) => sum + BigInt(row.gross_cents), 0n);
	}

	async openDraftLines(
		trx: Trx
	): Promise<{ netCents: bigint; taxCategory: string; taxRateBp: number }[]> {
		const rows = await trx
			.selectFrom('app.invoice_lines as l')
			.innerJoin('app.invoices as i', 'i.id', 'l.invoice_id')
			.select([
				'l.net_cents as netCents',
				'l.tax_category as taxCategory',
				'l.tax_rate_bp as taxRateBp'
			])
			.where('i.status', '=', 'draft')
			.execute();
		return rows.map((row) => ({
			netCents: BigInt(row.netCents),
			taxCategory: row.taxCategory,
			taxRateBp: row.taxRateBp
		}));
	}
}
