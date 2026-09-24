import { Injectable } from '@nestjs/common';
import type { FlexCap, WeekdayMinutes } from '@zeit/rules';
import type {
	AbsenceStatus,
	AbsenceType,
	EndReason,
	EntrySource,
	FederalState,
	FlexBooking,
	FlexCapMode,
	OptionalHoliday,
	UserRef
} from '@zeit/shared';
import { sql } from 'kysely';
import type { TenantContext, Trx } from '../db/database';

export type DateRange = { from: string; to: string };

export type EntryRow = {
	id: string;
	employeeId: string;
	workday: string;
	startedAt: string;
	endedAt: string | null;
	endReason: EndReason | null;
	source: EntrySource;
	requestId: string | null;
	voidedAt: string | null;
};

export type ContractRow = {
	validFrom: string;
	minutes: WeekdayMinutes;
	vacationDaysYear: string;
	vacationBasisDays: number;
	flexCap: FlexCap | null;
};

export type AbsenceDayRow = {
	date: string;
	requestId: string;
	type: AbsenceType;
	status: AbsenceStatus;
	portion: 0.5 | 1;
};

export type AckRow = {
	date: string;
	code: string;
	ruleVersion: string;
	note: string;
	at: string;
	by: UserRef;
};

// everything the day engine needs about one person; entries reach one day past both ends of the range
export type Sheet = {
	employee: {
		id: string;
		name: string;
		entryDate: string;
		exitDate: string | null;
		closedThrough: string | null;
	};
	contracts: ContractRow[];
	entries: EntryRow[];
	absences: AbsenceDayRow[];
	acks: AckRow[];
};

export type TenantSettings = {
	state: FederalState;
	holidayOptions: OptionalHoliday[];
	halfDays: boolean;
	flexCap: FlexCap;
	flexCapMode: FlexCapMode;
};

export type Cursor = { at: string; id: string };

const entryColumns = [
	'id',
	'employee_id as employeeId',
	'workday',
	'started_at as startedAt',
	'ended_at as endedAt',
	'end_reason as endReason',
	'source',
	'request_id as requestId',
	'voided_at as voidedAt'
] as const;

// app.users is closed to leads, the definer function hands out names within the tenant
export async function displayNames(
	trx: Trx,
	userIds: readonly string[]
): Promise<Map<string, string>> {
	if (userIds.length === 0) return new Map();
	const { rows } = await sql<{ id: string; display_name: string }>`
		select id, display_name from app.display_names(${[...new Set(userIds)]}::uuid[])`.execute(trx);
	return new Map(rows.map((row) => [row.id, row.display_name]));
}

@Injectable()
export class TimeStore {
	// one query per table however many people are asked for, rows the reader may not see are missing
	async sheets(
		trx: Trx,
		employeeIds: readonly string[],
		range: DateRange
	): Promise<{ tenant: TenantSettings; sheets: Map<string, Sheet> }> {
		const tenant = await this.tenant(trx);
		const sheets = new Map<string, Sheet>();
		if (employeeIds.length === 0) return { tenant, sheets };

		const [employees, contracts, entries, absences, acks] = await Promise.all([
			trx
				.selectFrom('app.employees')
				.select([
					'id',
					sql<string>`first_name || ' ' || last_name`.as('name'),
					'entry_date',
					'exit_date',
					'closed_through'
				])
				.where('id', 'in', employeeIds)
				.execute(),
			trx
				.selectFrom('app.contracts')
				.selectAll()
				.where('employee_id', 'in', employeeIds)
				.orderBy('valid_from')
				.execute(),
			trx
				.selectFrom('app.time_entries')
				.select(entryColumns)
				.where('employee_id', 'in', employeeIds)
				.where('voided_at', 'is', null)
				.where('workday', '>=', sql<string>`${range.from}::date - 1`)
				.where('workday', '<=', sql<string>`${range.to}::date + 1`)
				.orderBy('started_at')
				.execute(),
			trx
				.selectFrom('app.absence_days as d')
				.innerJoin('app.absence_requests as r', 'r.id', 'd.absence_id')
				.select(['d.employee_id', 'd.date', 'd.portion', 'r.id', 'r.type', 'r.status'])
				.where('d.employee_id', 'in', employeeIds)
				.where('d.superseded_at', 'is', null)
				.where('d.date', '>=', range.from)
				.where('d.date', '<=', range.to)
				.where('r.status', 'in', ['pending', 'approved', 'cancel_pending'])
				.execute(),
			trx
				.selectFrom('app.finding_acks')
				.selectAll()
				.where('employee_id', 'in', employeeIds)
				.where('work_date', '>=', range.from)
				.where('work_date', '<=', range.to)
				.execute()
		]);
		const names = await displayNames(
			trx,
			acks.map((ack) => ack.created_by)
		);

		for (const employee of employees) {
			sheets.set(employee.id, {
				employee: {
					id: employee.id,
					name: employee.name,
					entryDate: employee.entry_date,
					exitDate: employee.exit_date,
					closedThrough: employee.closed_through
				},
				contracts: [],
				entries: [],
				absences: [],
				acks: []
			});
		}
		for (const contract of contracts) {
			const override = contract.flex_cap_plus_min !== null || contract.flex_cap_minus_min !== null;
			sheets.get(contract.employee_id)?.contracts.push({
				validFrom: contract.valid_from,
				minutes: {
					mon: contract.min_mon,
					tue: contract.min_tue,
					wed: contract.min_wed,
					thu: contract.min_thu,
					fri: contract.min_fri,
					sat: contract.min_sat,
					sun: contract.min_sun
				},
				vacationDaysYear: contract.vacation_days_year,
				vacationBasisDays: contract.vacation_basis_days,
				flexCap: override
					? { plusMinutes: contract.flex_cap_plus_min, minusMinutes: contract.flex_cap_minus_min }
					: null
			});
		}
		for (const entry of entries) {
			sheets.get(entry.employeeId)?.entries.push(entry);
		}
		for (const day of absences) {
			sheets.get(day.employee_id)?.absences.push({
				date: day.date,
				requestId: day.id,
				type: day.type,
				status: day.status,
				// numeric(2,1) arrives as '0.5' or '1.0'
				portion: Number(day.portion) === 0.5 ? 0.5 : 1
			});
		}
		for (const ack of acks) {
			sheets.get(ack.employee_id)?.acks.push({
				date: ack.work_date,
				code: ack.rule_code,
				ruleVersion: ack.rule_version,
				note: ack.note,
				at: ack.created_at,
				by: { id: ack.created_by, displayName: names.get(ack.created_by) ?? '' }
			});
		}
		return { tenant, sheets };
	}

	async tenant(trx: Trx): Promise<TenantSettings> {
		const row = await trx
			.selectFrom('app.tenants')
			.select([
				'state',
				'holiday_options',
				'half_days_dec24_31',
				'flex_cap_plus_min',
				'flex_cap_minus_min',
				'flex_cap_mode'
			])
			.executeTakeFirstOrThrow();
		return {
			state: row.state,
			holidayOptions: row.holiday_options as OptionalHoliday[],
			halfDays: row.half_days_dec24_31,
			flexCap: { plusMinutes: row.flex_cap_plus_min, minusMinutes: row.flex_cap_minus_min },
			flexCapMode: row.flex_cap_mode
		};
	}

	entries(
		trx: Trx,
		employeeId: string,
		range: DateRange,
		after: Cursor | undefined,
		limit: number
	): Promise<EntryRow[]> {
		let query = trx
			.selectFrom('app.time_entries')
			.select(entryColumns)
			.where('employee_id', '=', employeeId)
			.where('voided_at', 'is', null)
			.where('workday', '>=', range.from)
			.where('workday', '<=', range.to);
		if (after) {
			query = query.where((eb) =>
				eb(eb.refTuple('started_at', 'id'), '>', eb.tuple(after.at, after.id))
			);
		}
		return query.orderBy('started_at').orderBy('id').limit(limit).execute();
	}

	// a shift still running from yesterday keeps its workday until it is stamped out
	clockEntries(trx: Trx, employeeId: string, today: string): Promise<EntryRow[]> {
		const running = trx
			.selectFrom('app.time_entries')
			.select('workday')
			.where('employee_id', '=', employeeId)
			.where('ended_at', 'is', null)
			.where('voided_at', 'is', null);
		return trx
			.selectFrom('app.time_entries')
			.select(entryColumns)
			.where('employee_id', '=', employeeId)
			.where('voided_at', 'is', null)
			.where('workday', '=', sql<string>`coalesce((${running}), ${today}::date)`)
			.orderBy('started_at')
			.execute();
	}

	// started_at stays on its default, the guard trigger takes nothing but now() for a stamp
	async stamp(trx: Trx, ctx: TenantContext, employeeId: string): Promise<void> {
		await trx
			.insertInto('app.time_entries')
			.values({
				tenant_id: ctx.tenantId,
				employee_id: employeeId,
				source: 'clock',
				created_by: ctx.userId
			})
			.execute();
	}

	async endRunning(trx: Trx, employeeId: string, reason: EndReason): Promise<boolean> {
		const ended = await trx
			.updateTable('app.time_entries')
			.set({ ended_at: sql<string>`now()`, end_reason: reason })
			.where('employee_id', '=', employeeId)
			.where('ended_at', 'is', null)
			.where('voided_at', 'is', null)
			.executeTakeFirst();
		return ended.numUpdatedRows > 0n;
	}

	async flexBookings(
		trx: Trx,
		employeeIds: readonly string[],
		range: DateRange
	): Promise<FlexBooking[]> {
		if (employeeIds.length === 0) return [];
		const rows = await trx
			.selectFrom('app.flex_bookings')
			.selectAll()
			.where('employee_id', 'in', employeeIds)
			.where('effective_date', '>=', range.from)
			.where('effective_date', '<=', range.to)
			.orderBy('effective_date')
			.orderBy('created_at')
			.execute();
		const names = await displayNames(
			trx,
			rows.flatMap((row) => row.created_by ?? [])
		);
		return rows.map((row) => ({
			id: row.id,
			employeeId: row.employee_id,
			type: row.type,
			minutes: row.minutes,
			effectiveDate: row.effective_date,
			reason: row.reason,
			monthClosingId: row.month_closing_id,
			createdBy: row.created_by
				? { id: row.created_by, displayName: names.get(row.created_by) ?? '' }
				: null,
			createdAt: row.created_at
		}));
	}

	// the closings are hr only, the definer function hands out the one balance
	async checkpoint(trx: Trx, employeeId: string, year: number): Promise<number | null> {
		const { rows } = await sql<{ minutes: number | null }>`
			select app.flex_checkpoint(${employeeId}, ${year}) as minutes`.execute(trx);
		return rows[0]?.minutes ?? null;
	}
}
