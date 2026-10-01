import { Injectable } from '@nestjs/common';
import {
	holidaysFor,
	parseDecimal,
	type Contract,
	type Employment,
	type FederalState,
	type Holiday,
	type OptionalHoliday
} from '@zeit/rules';
import type {
	EmployeeRef,
	Locale,
	NoticeChannel,
	VacationEntryType,
	VacationNotice
} from '@zeit/shared';
import { sql } from 'kysely';
import { Temporal } from 'temporal-polyfill';
import type { Trx } from '../db/database';
import type { Cursor } from '../time/time.store';
import type { LedgerEntry, NoticeRow } from './buckets';

export type LeaveCalendar = {
	state: FederalState;
	optional: OptionalHoliday[];
	halfDays: boolean;
	carryoverUntil: string;
};

export type Recipient = { email: string; displayName: string; locale: Locale };

export type NewLedgerEntry = {
	employeeId: string;
	bucketYear: number;
	entryType: VacationEntryType;
	days: string;
	effectiveDate: string;
	absenceId?: string;
	noticeId?: string;
	reason?: string;
	dedupeKey?: string;
	createdBy: string | null;
};

export type NewNotice = {
	employeeId: string;
	bucketYear: number;
	remainingDays: string;
	deadline: string;
	sentBy: string;
	channel: NoticeChannel;
	textVersion: string;
};

type NoticeFilter = {
	year?: number;
	ids?: readonly string[];
	visibleTo?: { employeeId: string | null; leads: boolean };
	after?: Cursor;
	limit?: number;
};

export function holidaysBetween(
	calendar: LeaveCalendar,
	from: Temporal.PlainDate,
	to: Temporal.PlainDate
): Holiday[] {
	const holidays: Holiday[] = [];
	for (let year = from.year; year <= to.year; year++) {
		holidays.push(
			...holidaysFor(year, calendar.state, {
				optional: calendar.optional,
				halfDays: calendar.halfDays
			}).filter(
				(holiday) =>
					Temporal.PlainDate.compare(holiday.date, from) >= 0 &&
					Temporal.PlainDate.compare(holiday.date, to) <= 0
			)
		);
	}
	return holidays;
}

const ledgerColumns = [
	'id',
	'bucket_year as bucketYear',
	'entry_type as entryType',
	'days',
	'effective_date as effectiveDate',
	'absence_id as absenceId',
	'notice_id as noticeId',
	'reason',
	'created_at as createdAt'
] as const;

@Injectable()
export class VacationStore {
	async employment(trx: Trx, employeeId: string): Promise<Employment | undefined> {
		const employee = await trx
			.selectFrom('app.employees')
			.select(['entry_date', 'exit_date'])
			.where('id', '=', employeeId)
			.executeTakeFirst();
		if (!employee) return undefined;

		const contracts = await trx
			.selectFrom('app.contracts')
			.selectAll()
			.where('employee_id', '=', employeeId)
			.orderBy('valid_from')
			.execute();
		return {
			entryDate: Temporal.PlainDate.from(employee.entry_date),
			exitDate: employee.exit_date ? Temporal.PlainDate.from(employee.exit_date) : null,
			contracts: contracts.map((row): Contract => ({
				validFrom: Temporal.PlainDate.from(row.valid_from),
				minutes: {
					mon: row.min_mon,
					tue: row.min_tue,
					wed: row.min_wed,
					thu: row.min_thu,
					fri: row.min_fri,
					sat: row.min_sat,
					sun: row.min_sun
				},
				vacationDaysYear: parseDecimal(row.vacation_days_year),
				vacationBasisDays: row.vacation_basis_days,
				capOverride:
					row.flex_cap_plus_min === null && row.flex_cap_minus_min === null
						? null
						: { plusMinutes: row.flex_cap_plus_min, minusMinutes: row.flex_cap_minus_min }
			}))
		};
	}

	async calendar(trx: Trx): Promise<LeaveCalendar> {
		const tenant = await trx
			.selectFrom('app.tenants')
			.select(['state', 'holiday_options', 'half_days_dec24_31', 'carryover_until'])
			.executeTakeFirstOrThrow();
		return {
			state: tenant.state,
			optional: tenant.holiday_options as OptionalHoliday[],
			halfDays: tenant.half_days_dec24_31,
			carryoverUntil: tenant.carryover_until
		};
	}

	async ledger(trx: Trx, employeeId: string): Promise<LedgerEntry[]> {
		return (await this.ledgerByEmployee(trx, [employeeId])).get(employeeId) ?? [];
	}

	async ledgerByEmployee(
		trx: Trx,
		employeeIds: readonly string[]
	): Promise<Map<string, LedgerEntry[]>> {
		if (employeeIds.length === 0) return new Map();
		const rows = await trx
			.selectFrom('app.vacation_ledger')
			.select(['employee_id', ...ledgerColumns])
			.where('employee_id', 'in', employeeIds)
			.orderBy('effective_date')
			.orderBy('created_at')
			.execute();
		const ledgers = new Map<string, LedgerEntry[]>();
		for (const { employee_id, ...entry } of rows) {
			const own = ledgers.get(employee_id) ?? [];
			own.push(entry);
			ledgers.set(employee_id, own);
		}
		return ledgers;
	}

	async notices(trx: Trx, employeeId: string): Promise<NoticeRow[]> {
		return (await this.noticesByEmployee(trx, [employeeId])).get(employeeId) ?? [];
	}

	async noticesByEmployee(
		trx: Trx,
		employeeIds: readonly string[]
	): Promise<Map<string, NoticeRow[]>> {
		if (employeeIds.length === 0) return new Map();
		const rows = await trx
			.selectFrom('app.vacation_notices')
			.select([
				'employee_id',
				'id',
				'bucket_year as bucketYear',
				'sent_at as sentAt',
				'deadline',
				'acknowledged_at as acknowledgedAt'
			])
			.where('employee_id', 'in', employeeIds)
			.orderBy('sent_at')
			.execute();
		const notices = new Map<string, NoticeRow[]>();
		for (const { employee_id, ...notice } of rows) {
			const own = notices.get(employee_id) ?? [];
			own.push(notice);
			notices.set(employee_id, own);
		}
		return notices;
	}

	async pendingDays(trx: Trx, employeeId: string): Promise<string> {
		return (await this.pendingByEmployee(trx, [employeeId])).get(employeeId) ?? '0.00';
	}

	async pendingByEmployee(trx: Trx, employeeIds: readonly string[]): Promise<Map<string, string>> {
		if (employeeIds.length === 0) return new Map();
		const rows = await trx
			.selectFrom('app.absence_days as d')
			.innerJoin('app.absence_requests as r', 'r.id', 'd.absence_id')
			.select(['d.employee_id', sql<string>`sum(d.vacation_days)::numeric(5, 2)`.as('days')])
			.where('d.employee_id', 'in', employeeIds)
			.where('d.superseded_at', 'is', null)
			.where('r.type', '=', 'vacation')
			.where('r.status', '=', 'pending')
			.groupBy('d.employee_id')
			.execute();
		return new Map(rows.map((row) => [row.employee_id, row.days]));
	}

	async book(trx: Trx, entries: NewLedgerEntry[]): Promise<LedgerEntry[]> {
		if (entries.length === 0) return [];
		return trx
			.insertInto('app.vacation_ledger')
			.values(
				entries.map((entry) => ({
					tenant_id: sql<string>`app.tenant_id()`,
					employee_id: entry.employeeId,
					bucket_year: entry.bucketYear,
					entry_type: entry.entryType,
					days: entry.days,
					effective_date: entry.effectiveDate,
					absence_id: entry.absenceId ?? null,
					notice_id: entry.noticeId ?? null,
					reason: entry.reason ?? null,
					dedupe_key: entry.dedupeKey ?? null,
					created_by: entry.createdBy
				}))
			)
			.onConflict((conflict) => conflict.columns(['tenant_id', 'dedupe_key']).doNothing())
			.returning(ledgerColumns)
			.execute();
	}

	async employees(trx: Trx, ids: readonly string[]): Promise<Map<string, EmployeeRef>> {
		if (ids.length === 0) return new Map();
		const rows = await trx
			.selectFrom('app.employees as e')
			.select(['e.id', sql<string>`e.first_name || ' ' || e.last_name`.as('name')])
			.where('e.id', 'in', ids)
			.execute();
		return new Map(rows.map((row) => [row.id, row]));
	}

	async userNames(trx: Trx, ids: readonly (string | null)[]): Promise<Map<string, string>> {
		const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
		if (wanted.length === 0) return new Map();
		const { rows } = await sql<{ id: string; display_name: string }>`
			select id, display_name from app.display_names(${wanted}::uuid[])`.execute(trx);
		return new Map(rows.map((row) => [row.id, row.display_name]));
	}

	async recipients(trx: Trx, employeeIds: readonly string[]): Promise<Map<string, Recipient>> {
		if (employeeIds.length === 0) return new Map();
		const rows = await trx
			.selectFrom('app.users')
			.select(['employee_id', 'email', 'display_name', 'locale'])
			.where('employee_id', 'in', employeeIds)
			.execute();
		return new Map(
			rows.map((row) => [
				row.employee_id!,
				{ email: row.email, displayName: row.display_name, locale: row.locale as Locale }
			])
		);
	}

	async remainingIn(
		trx: Trx,
		year: number,
		employeeIds: readonly string[]
	): Promise<Map<string, string>> {
		const rows = await trx
			.selectFrom('app.vacation_ledger')
			.select(['employee_id', sql<string>`sum(days)::numeric(5, 2)`.as('days')])
			.where('bucket_year', '=', year)
			.where('employee_id', 'in', employeeIds)
			.groupBy('employee_id')
			.execute();
		return new Map(rows.map((row) => [row.employee_id, row.days]));
	}

	async notifiedToday(
		trx: Trx,
		year: number,
		employeeIds: readonly string[]
	): Promise<Set<string>> {
		await sql`
			select pg_advisory_xact_lock(
				hashtextextended('vacation_notices ' || app.tenant_id()::text, 0))`.execute(trx);
		const rows = await trx
			.selectFrom('app.vacation_notices')
			.select('employee_id')
			.distinct()
			.where('bucket_year', '=', year)
			.where('employee_id', 'in', employeeIds)
			.where('sent_at', '>=', sql<string>`date_trunc('day', now(), 'Europe/Berlin')`)
			.execute();
		return new Set(rows.map((row) => row.employee_id));
	}

	async insertNotices(trx: Trx, notices: NewNotice[]): Promise<string[]> {
		const rows = await trx
			.insertInto('app.vacation_notices')
			.values(
				notices.map((notice) => ({
					tenant_id: sql<string>`app.tenant_id()`,
					employee_id: notice.employeeId,
					bucket_year: notice.bucketYear,
					remaining_days: notice.remainingDays,
					deadline: notice.deadline,
					sent_by: notice.sentBy,
					channel: notice.channel,
					text_version: notice.textVersion
				}))
			)
			.returning('id')
			.execute();
		return rows.map((row) => row.id);
	}

	async noticeList(trx: Trx, filter: NoticeFilter): Promise<VacationNotice[]> {
		let query = trx
			.selectFrom('app.vacation_notices as n')
			.innerJoin('app.employees as e', 'e.id', 'n.employee_id')
			.select([
				'n.id',
				'n.employee_id',
				sql<string>`e.first_name || ' ' || e.last_name`.as('employee_name'),
				'n.bucket_year',
				'n.remaining_days',
				'n.deadline',
				'n.sent_at',
				'n.sent_by',
				'n.channel',
				'n.text_version',
				'n.acknowledged_at'
			])
			.orderBy('n.sent_at', 'desc')
			.orderBy('n.id', 'desc');
		if (filter.year !== undefined) query = query.where('n.bucket_year', '=', filter.year);
		if (filter.ids) query = query.where('n.id', 'in', filter.ids);
		const viewer = filter.visibleTo;
		if (viewer) {
			query = query.where((eb) =>
				eb.or([
					...(viewer.employeeId ? [eb('n.employee_id', '=', viewer.employeeId)] : []),
					...(viewer.leads ? [sql<boolean>`app.leads(${eb.ref('n.employee_id')})`] : [])
				])
			);
		}
		const after = filter.after;
		if (after) {
			query = query.where((eb) =>
				eb(eb.refTuple('n.sent_at', 'n.id'), '<', eb.tuple(after.at, after.id))
			);
		}
		if (filter.limit !== undefined) query = query.limit(filter.limit);

		const rows = await query.execute();
		const names = await this.userNames(
			trx,
			rows.map((row) => row.sent_by)
		);
		return rows.map((row) => ({
			id: row.id,
			employee: { id: row.employee_id, name: row.employee_name },
			bucketYear: row.bucket_year,
			remainingDays: row.remaining_days,
			deadline: row.deadline,
			sentAt: row.sent_at,
			sentBy: { id: row.sent_by, displayName: names.get(row.sent_by) ?? '' },
			channel: row.channel,
			textVersion: row.text_version,
			acknowledgedAt: row.acknowledged_at
		}));
	}

	async acknowledge(trx: Trx, id: string, employeeId: string): Promise<boolean> {
		const updated = await trx
			.updateTable('app.vacation_notices')
			.set({ acknowledged_at: sql<string>`now()` })
			.where('id', '=', id)
			.where('employee_id', '=', employeeId)
			.where('acknowledged_at', 'is', null)
			.executeTakeFirst();
		return updated.numUpdatedRows === 1n;
	}
}
