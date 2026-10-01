import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { applyCap, ruleSetFor, type CapDecision } from '@zeit/rules';
import type {
	ApiError,
	ChecklistKind,
	Day,
	EmployeeRef,
	MonthChecklist,
	MonthClosing,
	ReopenMonthInput
} from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { Clock } from '../common/clock';
import type { AuthSession } from '../common/session.guard';
import { Database, type Trx } from '../db/database';
import { buildDays, localDate, totalsOf } from '../time/day-engine';
import { flexBalance } from '../time/flex-balance';
import {
	displayNames,
	TimeStore,
	type DateRange,
	type Sheet,
	type TenantSettings
} from '../time/time.store';
import { MonthsStore, type Cap } from './months.store';
import type { MonthSnapshot, SnapshotRow } from './snapshot';

type Item = MonthChecklist['items'][number];

export type Figures = { sheet: Sheet; days: Day[]; row: SnapshotRow };

export function monthRange(month: string): DateRange {
	const { daysInMonth } = Temporal.PlainYearMonth.from(month);
	return { from: `${month}-01`, to: `${month}-${daysInMonth}` };
}

export const isClosed = (month: string, lastClosed: string | null) =>
	lastClosed !== null && month <= lastClosed;

function notInState(message: string, details: Record<string, unknown> | null = null) {
	return new ConflictException({ code: 'INVALID_STATE', message, details } satisfies ApiError);
}

function capOf(tenant: TenantSettings, { sheet, row }: Figures, until: string): CapDecision {
	const limit =
		sheet.contracts.findLast((contract) => contract.validFrom <= until)?.flexCap ?? tenant.flexCap;
	return applyCap(row.flexBalanceMinutes, limit, tenant.flexCapMode);
}

function item(kind: ChecklistKind, blocking: boolean, hits: EmployeeRef[]): Item {
	return {
		kind,
		blocking,
		employees: [...new Map(hits.map((hit) => [hit.id, hit])).values()],
		explanation: { key: `months.checklist.${kind}`, params: { count: hits.length } }
	};
}

@Injectable()
export class MonthsService {
	constructor(
		private readonly db: Database,
		private readonly store: MonthsStore,
		private readonly time: TimeStore,
		private readonly clock: Clock
	) {}

	checklist(session: AuthSession, month: string): Promise<MonthChecklist> {
		const now = this.clock.now();
		const range = monthRange(month);
		return this.db.withTenant(session, async (trx) => {
			const lastClosed = await this.store.lastClosed(trx);
			const closed = isClosed(month, lastClosed);
			const previous = Temporal.PlainYearMonth.from(month).subtract({ months: 1 }).toString();

			const items: Item[] = [];
			if (!closed && lastClosed !== null && lastClosed < previous) {
				items.push({
					kind: 'previous_month_open',
					blocking: true,
					employees: [],
					explanation: { key: 'months.checklist.previous_month_open', params: { month: previous } }
				});
			}
			items.push(...(await this.blockers(trx, range)));

			const people = await this.store.employed(trx, range);
			const { tenant, figures } = await this.figures(
				trx,
				people.map((person) => person.id),
				month,
				now
			);
			const unacked = [...figures.values()].flatMap(({ sheet, days }) =>
				days.flatMap((day) =>
					day.findings
						.filter((finding) => !finding.ack)
						.map(() => ({ id: sheet.employee.id, name: sheet.employee.name }))
				)
			);
			if (unacked.length > 0) items.push(item('open_finding', false, unacked));

			const capPreview = closed
				? []
				: [...figures.values()].flatMap((figure) => {
						const { forfeited } = capOf(tenant, figure, range.to);
						const { id, name } = figure.sheet.employee;
						return forfeited === 0 ? [] : [{ employee: { id, name }, forfeitedMinutes: forfeited }];
					});

			return {
				month,
				closed,
				closable:
					!closed &&
					month < localDate(now).slice(0, 7) &&
					!items.some((candidate) => candidate.blocking),
				items,
				capPreview
			};
		});
	}

	close(session: AuthSession, month: string): Promise<MonthClosing> {
		const now = this.clock.now();
		const range = monthRange(month);
		return this.db.withTenant(session, async (trx) => {
			if (isClosed(month, await this.store.lastClosed(trx))) {
				throw notInState('The month is already closed');
			}
			const blockers = await this.blockers(trx, range);
			if (blockers.length > 0) {
				throw notInState('Open points block the closing', {
					kinds: blockers.map((blocker) => blocker.kind)
				});
			}

			const people = await this.store.employed(trx, range);
			const { tenant, figures } = await this.figures(
				trx,
				people.map((person) => person.id),
				month,
				now
			);
			const id = randomUUID();
			const versions = [range.from, range.to].map(
				(date) => ruleSetFor(Temporal.PlainDate.from(date)).version
			);
			const snapshot: MonthSnapshot = { ruleVersions: [...new Set(versions)], employees: {} };
			const caps: Cap[] = [];
			for (const [employeeId, figure] of figures) {
				const cap = capOf(tenant, figure, range.to);
				if (cap.forfeited !== 0) caps.push({ employeeId, minutes: -cap.forfeited });
				snapshot.employees[employeeId] = { ...figure.row, flexBalanceMinutes: cap.kept };
			}

			await this.store.bookCaps(
				trx,
				session.userId,
				id,
				range.to,
				`Kappung beim Abschluss ${month}`,
				caps
			);
			const { createdAt } = await this.store.insertClosing(trx, session.userId, {
				id,
				month,
				action: 'close',
				reason: null,
				snapshot
			});
			return this.closing(trx, session, {
				id,
				month,
				action: 'close',
				reason: null,
				at: createdAt,
				capped: caps.map(({ employeeId, minutes }) => ({
					employee: { id: employeeId, name: figures.get(employeeId)!.sheet.employee.name },
					forfeitedMinutes: -minutes
				}))
			});
		});
	}

	reopen(session: AuthSession, month: string, input: ReopenMonthInput): Promise<MonthClosing> {
		const range = monthRange(month);
		return this.db.withTenant(session, async (trx) => {
			const id = randomUUID();
			const { createdAt } = await this.store.insertClosing(trx, session.userId, {
				id,
				month,
				action: 'reopen',
				reason: input.reason,
				snapshot: null
			});
			const undone = (await this.store.latestClose(trx, month))!;
			const caps = await this.store.caps(trx, undone.id);
			await this.store.bookCaps(
				trx,
				session.userId,
				id,
				range.to,
				`Kappung zurückgebucht, ${month} wieder geöffnet`,
				caps.map((cap) => ({ employeeId: cap.employeeId, minutes: -cap.minutes }))
			);
			return this.closing(trx, session, {
				id,
				month,
				action: 'reopen',
				reason: input.reason,
				at: createdAt,
				capped: []
			});
		});
	}

	async figures(
		trx: Trx,
		employeeIds: readonly string[],
		month: string,
		now: Date
	): Promise<{ tenant: TenantSettings; figures: Map<string, Figures> }> {
		const range = monthRange(month);
		const today = localDate(now);
		const asOf = today < range.to ? today : range.to;
		const counted = { from: `${month.slice(0, 4)}-01-01`, to: range.to };
		const [{ tenant, sheets }, bookings, leave, carryovers] = await Promise.all([
			this.time.sheets(trx, employeeIds, counted),
			this.time.flexBookings(trx, employeeIds, { from: counted.from, to: asOf }),
			this.store.leave(trx, employeeIds, range),
			this.time.checkpoints(trx, employeeIds, Number(month.slice(0, 4)))
		]);

		const figures = new Map<string, Figures>();
		for (const [id, sheet] of sheets) {
			const days = buildDays(sheet, tenant, counted, now);
			const ofMonth = days.filter((day) => day.date >= range.from);
			const unacked = ofMonth.flatMap((day) => day.findings.filter((finding) => !finding.ack));
			const flex = flexBalance(sheet, days, bookings, carryovers, asOf);
			figures.set(id, {
				sheet,
				days: ofMonth,
				row: {
					...totalsOf(ofMonth),
					flexBalanceMinutes: flex.balanceMinutes,
					vacationDays: leave.get(id)?.vacationDays ?? '0.00',
					sickDays: leave.get(id)?.sickDays ?? '0.00',
					openFindings: unacked.length
				}
			});
		}
		return { tenant, figures };
	}

	private async blockers(trx: Trx, range: DateRange): Promise<Item[]> {
		const [running, corrections, absences] = await Promise.all([
			this.store.running(trx, range.to),
			this.store.pendingCorrections(trx, range),
			this.store.pendingAbsences(trx, range)
		]);
		return [
			item('running_entry', true, running),
			item('pending_correction', true, corrections),
			item('pending_absence', true, absences)
		].filter((found) => found.employees.length > 0);
	}

	private async closing(
		trx: Trx,
		session: AuthSession,
		closing: Omit<MonthClosing, 'actor'>
	): Promise<MonthClosing> {
		const names = await displayNames(trx, [session.userId]);
		return {
			...closing,
			actor: { id: session.userId, displayName: names.get(session.userId) ?? '' }
		};
	}
}
