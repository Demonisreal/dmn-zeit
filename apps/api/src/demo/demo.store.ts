import { Injectable } from '@nestjs/common';
import type { DemoPlan, PlanRow } from '@zeit/demo-data';
import type { AbsenceStatus, Locale, OutboxMail, Persona, WeekdayMinutes } from '@zeit/shared';
import { sql } from 'kysely';
import { Database, type Trx } from '../db/database';

export type Attempt = { window: 'hour' | 'day'; hits: number; retryAfter: number };

// guard_request_status only lets a request in as pending and then walks it along its transitions
const STEPS: Record<AbsenceStatus, AbsenceStatus[]> = {
	pending: [],
	approved: ['approved'],
	rejected: ['rejected'],
	withdrawn: ['withdrawn'],
	cancel_pending: ['approved', 'cancel_pending'],
	cancelled: ['approved', 'cancelled']
};

// out of the way before the rest arrives, the overlap constraint only sees open and approved ones
const SETTLED: AbsenceStatus[] = ['rejected', 'withdrawn', 'cancelled'];

// the tenant of the transaction, a function call instead of one more parameter per row
const tenantId = sql<string>`app.tenant_id()`;

// at most 65535 bind parameters per statement, the entries of a story ending in july need 50000
const ENTRY_BLOCK = 1000;

const perDay = (minutes: WeekdayMinutes) => ({
	min_mon: minutes.mon,
	min_tue: minutes.tue,
	min_wed: minutes.wed,
	min_thu: minutes.thu,
	min_fri: minutes.fri,
	min_sat: minutes.sat,
	min_sun: minutes.sun
});

@Injectable()
export class DemoStore {
	constructor(private readonly db: Database) {}

	// zeit_app only sees its own tenant, the definer function counts all of them
	async activeSandboxes(): Promise<number> {
		const { rows } = await sql<{ count: number }>`
			select count(*)::int as count from ops.active_tenants() where kind = 'sandbox'`.execute(this.db);
		return rows[0]!.count;
	}

	// fixed windows opened by the first attempt, the day window ends at midnight with the address salt
	async countAttempt(address: string): Promise<Attempt[]> {
		const { rows } = await sql<Attempt>`
			insert into ops.rate_limits as r (key, hits, expires_at)
			values (${`demo-sandbox:hour:${address}`}, 1, now() + interval '1 hour'),
				(${`demo-sandbox:day:${address}`}, 1,
					((now() at time zone 'Europe/Berlin')::date + 1)::timestamp at time zone 'Europe/Berlin')
			on conflict (key) do update
				set hits = case when r.expires_at > now() then r.hits + 1 else 1 end,
					expires_at = case when r.expires_at > now() then r.expires_at else excluded.expires_at end
			returning split_part(r.key, ':', 2) as "window", r.hits,
				ceil(extract(epoch from r.expires_at - now()))::int as "retryAfter"`.execute(this.db);
		return rows;
	}

	async write(trx: Trx, plan: DemoPlan, locale: Locale): Promise<void> {
		const { tenant } = plan;
		await sql`select ops.sandbox_create(${tenant.id}, ${tenant.name}, ${tenant.slug},
			${tenant.state}, ${tenant.flexCapPlusMinutes}, ${tenant.flexCapMinusMinutes},
			${tenant.flexCapMode})`.execute(trx);

		await trx
			.insertInto('app.teams')
			.values(plan.teams.map((team) => ({ id: team.id, tenant_id: tenantId, name: team.name })))
			.execute();

		await trx
			.insertInto('app.work_models')
			.values(
				plan.workModels.map((model) => ({
					id: model.id,
					tenant_id: tenantId,
					name: model.name,
					...perDay(model.minutes)
				}))
			)
			.execute();

		await trx
			.insertInto('app.employees')
			.values(
				plan.employees.map((employee) => ({
					id: employee.id,
					tenant_id: tenantId,
					personnel_no: employee.personnelNo,
					first_name: employee.firstName,
					last_name: employee.lastName,
					team_id: employee.teamId,
					entry_date: employee.entryDate,
					exit_date: employee.exitDate
				}))
			)
			.execute();

		// every persona speaks the language the visitor started the demo in
		await trx
			.insertInto('app.users')
			.values(
				plan.users.map((user) => ({
					id: user.id,
					tenant_id: tenantId,
					email: user.email,
					display_name: user.displayName,
					role: user.role,
					locale,
					status: 'demo' as const,
					employee_id: user.employeeId
				}))
			)
			.execute();

		await trx
			.insertInto('app.team_leads')
			.values(
				plan.teams.flatMap((team) =>
					team.leadUserIds.map((user_id) => ({ tenant_id: tenantId, team_id: team.id, user_id }))
				)
			)
			.execute();

		await trx
			.insertInto('app.contracts')
			.values(
				plan.contracts.map((contract) => ({
					id: contract.id,
					tenant_id: tenantId,
					employee_id: contract.employeeId,
					valid_from: contract.validFrom,
					work_model_id: contract.workModelId,
					...perDay(contract.minutes),
					vacation_days_year: contract.vacationDaysYear,
					vacation_basis_days: contract.vacationBasisDays
				}))
			)
			.execute();

		const entries = plan.entries.map((entry) => ({
			id: entry.id,
			tenant_id: tenantId,
			employee_id: entry.employeeId,
			started_at: entry.startedAt,
			ended_at: entry.endedAt,
			end_reason: entry.endReason,
			source: entry.source
		}));
		for (let i = 0; i < entries.length; i += ENTRY_BLOCK) {
			await trx
				.insertInto('app.time_entries')
				.values(entries.slice(i, i + ENTRY_BLOCK))
				.execute();
		}

		await this.corrections(trx, plan.corrections);

		const settled = plan.absences.filter((absence) => SETTLED.includes(absence.status));
		const open = plan.absences.filter((absence) => !SETTLED.includes(absence.status));
		await this.absences(trx, settled);
		await this.absences(trx, open);

		await trx
			.insertInto('app.absence_days')
			.values(
				plan.absenceDays.map((day) => ({
					id: day.id,
					tenant_id: tenantId,
					employee_id: day.employeeId,
					absence_id: day.absenceId,
					date: day.date,
					portion: day.portion,
					target_minutes: day.targetMinutes,
					vacation_days: day.vacationDays,
					superseded_at: day.supersededAt,
					superseded_by: day.supersededBy
				}))
			)
			.execute();

		await trx
			.insertInto('app.vacation_notices')
			.values(
				plan.vacationNotices.map((notice) => ({
					id: notice.id,
					tenant_id: tenantId,
					employee_id: notice.employeeId,
					bucket_year: notice.bucketYear,
					remaining_days: notice.remainingDays,
					deadline: notice.deadline,
					sent_at: notice.sentAt,
					sent_by: notice.sentBy,
					channel: notice.channel,
					text_version: notice.textVersion
				}))
			)
			.execute();

		await trx
			.insertInto('app.vacation_ledger')
			.values(
				plan.vacationLedger.map((entry) => ({
					id: entry.id,
					tenant_id: tenantId,
					employee_id: entry.employeeId,
					bucket_year: entry.bucketYear,
					entry_type: entry.entryType,
					days: entry.days,
					effective_date: entry.effectiveDate,
					absence_id: entry.absenceId,
					notice_id: entry.noticeId,
					reason: entry.reason,
					dedupe_key: entry.dedupeKey,
					created_by: entry.createdBy,
					created_at: entry.createdAt
				}))
			)
			.execute();

		await trx
			.insertInto('app.finding_acks')
			.values(
				plan.findingAcks.map((ack) => ({
					id: ack.id,
					tenant_id: tenantId,
					employee_id: ack.employeeId,
					work_date: ack.workDate,
					rule_code: ack.ruleCode,
					rule_version: ack.ruleVersion,
					note: ack.note,
					created_by: ack.createdBy,
					created_at: ack.createdAt
				}))
			)
			.execute();

		// the cap_forfeit booking points at a closing that follows below, the foreign key is deferred
		await trx
			.insertInto('app.flex_bookings')
			.values(
				plan.flexBookings.map((booking) => ({
					id: booking.id,
					tenant_id: tenantId,
					employee_id: booking.employeeId,
					type: booking.type,
					minutes: booking.minutes,
					effective_date: booking.effectiveDate,
					reason: booking.reason,
					month_closing_id: booking.monthClosingId,
					created_by: booking.createdBy,
					created_at: booking.createdAt
				}))
			)
			.execute();

		// one statement per month, apply_month_closing counts the rows of its own statement as closed
		for (const closing of plan.monthClosings) {
			await trx
				.insertInto('app.month_closings')
				.values({
					id: closing.id,
					tenant_id: tenantId,
					month: closing.month,
					action: closing.action,
					reason: closing.reason,
					snapshot: closing.snapshot,
					created_by: closing.createdBy,
					created_at: closing.createdAt
				})
				.execute();
		}
	}

	// everyone ops.demo_switch_persona would switch to
	async personas(trx: Trx, userId: string): Promise<Persona[]> {
		const rows = await trx
			.selectFrom('app.users as u')
			.innerJoin('app.tenants as t', 't.id', 'u.tenant_id')
			.leftJoin('app.employees as e', 'e.id', 'u.employee_id')
			.select([
				'u.id',
				'u.display_name',
				'u.role',
				'e.id as employee_id',
				sql<string>`e.first_name || ' ' || e.last_name`.as('employee_name')
			])
			.where('t.kind', '=', 'sandbox')
			.where('u.status', 'in', ['active', 'demo'])
			// the enum runs up the role ladder
			.orderBy('u.role')
			.orderBy('u.display_name')
			.execute();

		return rows.map((row) => ({
			userId: row.id,
			displayName: row.display_name,
			role: row.role,
			employee: row.employee_id ? { id: row.employee_id, name: row.employee_name } : null,
			current: row.id === userId
		}));
	}

	// false when the session is gone, the sandbox expired or the person belongs to another one
	async switchPersona(
		sessionHash: Buffer,
		userId: string,
		tokenHash: Buffer,
		csrfHash: Buffer
	): Promise<boolean> {
		const { rows } = await sql<{ id: string | null }>`
			select ops.demo_switch_persona(${sessionHash}, ${userId}, ${tokenHash}, ${csrfHash}) as id`.execute(
			this.db
		);
		return rows[0]!.id !== null;
	}

	outbox(trx: Trx): Promise<OutboxMail[]> {
		return trx
			.selectFrom('ops.demo_outbox')
			.select(['id', 'recipient as to', 'subject', 'body as text', 'created_at as createdAt'])
			.orderBy('created_at', 'desc')
			.execute();
	}

	private async corrections(trx: Trx, rows: PlanRow<'corrections'>[]) {
		await trx
			.insertInto('app.correction_requests')
			.values(
				rows.map((correction) => ({
					id: correction.id,
					tenant_id: tenantId,
					employee_id: correction.employeeId,
					action: correction.action,
					target_entry_id: correction.targetEntryId,
					new_started_at: correction.newStartedAt,
					new_ended_at: correction.newEndedAt,
					reason: correction.reason,
					requested_by: correction.requestedBy,
					created_at: correction.createdAt
				}))
			)
			.execute();

		const decided = rows.filter((correction) => correction.status !== 'pending');
		if (decided.length === 0) return;
		await sql`
			update app.correction_requests c
				set status = x.status, decided_by = x."decidedBy", decided_at = x."decidedAt"
			from jsonb_to_recordset(${JSON.stringify(decided)}::jsonb)
				as x (id uuid, status app.correction_status, "decidedBy" uuid, "decidedAt" timestamptz)
			where c.id = x.id`.execute(trx);
	}

	private async absences(trx: Trx, rows: PlanRow<'absences'>[]) {
		if (rows.length === 0) return;
		await trx
			.insertInto('app.absence_requests')
			.values(
				rows.map((absence) => ({
					id: absence.id,
					tenant_id: tenantId,
					employee_id: absence.employeeId,
					type: absence.type,
					start_date: absence.startDate,
					end_date: absence.endDate,
					half_day_start: absence.halfDayStart,
					half_day_end: absence.halfDayEnd,
					requested_by: absence.requestedBy,
					certificate_confirmed_at: absence.certificateConfirmedAt,
					certificate_confirmed_by: absence.certificateConfirmedBy,
					created_at: absence.createdAt
				}))
			)
			.execute();

		for (const step of [0, 1]) {
			const moves = rows.flatMap((absence) => {
				const status = STEPS[absence.status][step];
				return status ? [{ ...absence, status }] : [];
			});
			if (moves.length === 0) continue;
			await sql`
				update app.absence_requests r
					set status = x.status, decided_by = x."decidedBy", decided_at = x."decidedAt",
						decision_note = x."decisionNote"
				from jsonb_to_recordset(${JSON.stringify(moves)}::jsonb)
					as x (id uuid, status app.absence_status, "decidedBy" uuid, "decidedAt" timestamptz,
						"decisionNote" text)
				where r.id = x.id`.execute(trx);
		}
	}
}
