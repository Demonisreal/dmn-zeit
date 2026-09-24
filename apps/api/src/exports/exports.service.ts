import { Injectable, NotFoundException } from '@nestjs/common';
import type { Locale, MonthOverview, Timesheet } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { Clock } from '../common/clock';
import { assertCanSee } from '../common/scope';
import type { AuthSession } from '../common/session.guard';
import { Database, type Trx } from '../db/database';
import { isClosed, monthRange, MonthsService } from '../months/months.service';
import { MonthsStore, type Staff } from '../months/months.store';
import type { SnapshotRow } from '../months/snapshot';
import { TIME_ZONE, totalsOf } from '../time/day-engine';
import { toCsv, type Cell } from './csv';
import { ExportsStore } from './exports.store';

export type Download = { filename: string; body: string };

type OverviewRow = MonthOverview['rows'][number];

// field by field, so a snapshot of an older shape cannot put anything else into the answer
function overviewRow(employee: Staff, figures: SnapshotRow): OverviewRow {
	return {
		employee,
		targetMinutes: figures.targetMinutes,
		workedMinutes: figures.workedMinutes,
		creditedMinutes: figures.creditedMinutes,
		diffMinutes: figures.diffMinutes,
		flexBalanceMinutes: figures.flexBalanceMinutes,
		vacationDays: figures.vacationDays,
		sickDays: figures.sickDays,
		openFindings: figures.openFindings
	};
}

// a german spreadsheet splits on ; and takes the comma for the decimal point
const separatorOf = (locale: Locale) => (locale === 'de' ? ';' : ',');
const decimal = (text: string, locale: Locale) => (locale === 'de' ? text.replace('.', ',') : text);

const clockTime = (instant: string) =>
	Temporal.Instant.from(instant)
		.toZonedDateTimeISO(TIME_ZONE)
		.toPlainTime()
		.toString({ smallestUnit: 'minute' });

function timesheetRows(sheet: Timesheet, locale: Locale): Cell[][] {
	const { totals } = sheet;
	return [
		[
			'date',
			'entries',
			'break_minutes',
			'target_minutes',
			'worked_minutes',
			'credited_minutes',
			'diff_minutes',
			'absence',
			'absence_portion',
			'holiday',
			'flex_balance_minutes'
		],
		...sheet.days.map((day) => [
			day.date,
			day.entries
				.map(
					(entry) =>
						`${clockTime(entry.startedAt)}-${entry.endedAt ? clockTime(entry.endedAt) : ''}`
				)
				.join(', '),
			day.breakMinutes,
			day.targetMinutes,
			day.workedMinutes,
			day.creditedMinutes,
			day.diffMinutes,
			day.absence?.type ?? '',
			day.absence ? decimal(String(day.absence.portion), locale) : '',
			day.holiday ?? '',
			''
		]),
		[
			'total',
			'',
			'',
			totals.targetMinutes,
			totals.workedMinutes,
			totals.creditedMinutes,
			totals.diffMinutes,
			'',
			'',
			'',
			sheet.flexBalanceMinutes
		]
	];
}

function overviewRows(overview: MonthOverview, locale: Locale): Cell[][] {
	return [
		[
			'personnel_no',
			'name',
			'target_minutes',
			'worked_minutes',
			'credited_minutes',
			'diff_minutes',
			'flex_balance_minutes',
			'vacation_days',
			'sick_days',
			'open_findings'
		],
		...overview.rows.map((row) => [
			row.employee.personnelNo,
			row.employee.name,
			row.targetMinutes,
			row.workedMinutes,
			row.creditedMinutes,
			row.diffMinutes,
			row.flexBalanceMinutes,
			decimal(row.vacationDays, locale),
			decimal(row.sickDays, locale),
			row.openFindings
		])
	];
}

@Injectable()
export class ExportsService {
	constructor(
		private readonly db: Database,
		private readonly store: ExportsStore,
		private readonly months: MonthsService,
		private readonly closings: MonthsStore,
		private readonly clock: Clock
	) {}

	timesheet(session: AuthSession, employeeId: string, month: string): Promise<Timesheet> {
		return this.db.withTenant(session, (trx) => this.sheet(trx, session, employeeId, month));
	}

	timesheetCsv(session: AuthSession, employeeId: string, month: string): Promise<Download> {
		return this.db.withTenant(session, async (trx) => {
			const sheet = await this.sheet(trx, session, employeeId, month);
			const locale = await this.store.locale(trx, session.userId);
			// the personnel number is free text and must not bring quotes or line breaks into the header
			const personnelNo = sheet.employee.personnelNo.replace(/[^\w-]/g, '_');
			return {
				filename: `timesheet-${month}-${personnelNo}.csv`,
				body: toCsv(timesheetRows(sheet, locale), separatorOf(locale))
			};
		});
	}

	overview(session: AuthSession, month: string): Promise<MonthOverview> {
		return this.db.withTenant(session, (trx) => this.overviewOf(trx, month));
	}

	overviewCsv(session: AuthSession, month: string): Promise<Download> {
		return this.db.withTenant(session, async (trx) => {
			const overview = await this.overviewOf(trx, month);
			const locale = await this.store.locale(trx, session.userId);
			return {
				filename: `month-overview-${month}.csv`,
				body: toCsv(overviewRows(overview, locale), separatorOf(locale))
			};
		});
	}

	// a closed month keeps its days from the locked entries, its balance from the snapshot
	private async sheet(
		trx: Trx,
		session: AuthSession,
		employeeId: string,
		month: string
	): Promise<Timesheet> {
		await assertCanSee(trx, session, employeeId);
		const [employee] = await this.store.identities(trx, [employeeId]);
		if (!employee) throw new NotFoundException('Employee not found');

		const now = this.clock.now();
		const [tenant, { figures }] = await Promise.all([
			this.store.tenant(trx),
			this.months.figures(trx, [employeeId], month, now)
		]);
		const { sheet, days, row } = figures.get(employeeId)!;
		const closed = isClosed(month, sheet.employee.closedThrough);
		const snapshot = closed ? await this.store.monthSnapshot(trx, employeeId, month) : null;

		return {
			tenant,
			employee,
			month,
			closed,
			days: days.map((day) => ({
				date: day.date,
				entries: day.entries.map((entry) => ({
					startedAt: entry.startedAt,
					endedAt: entry.endedAt
				})),
				breakMinutes: day.breakMinutes,
				targetMinutes: day.target.minutes,
				workedMinutes: day.workedMinutes,
				creditedMinutes: day.creditedMinutes,
				diffMinutes: day.diffMinutes,
				// a request still waiting for its decision is no part of the record
				absence:
					day.absence && ['approved', 'cancel_pending'].includes(day.absence.status)
						? { type: day.absence.type, portion: day.absence.portion }
						: null,
				holiday: day.holiday?.code ?? null
			})),
			totals: totalsOf(days),
			flexBalanceMinutes: snapshot?.flexBalanceMinutes ?? row.flexBalanceMinutes,
			generatedAt: now.toISOString()
		};
	}

	private async overviewOf(trx: Trx, month: string): Promise<MonthOverview> {
		const now = this.clock.now();
		const closed = isClosed(month, await this.closings.lastClosed(trx));
		const snapshot = closed ? (await this.closings.latestClose(trx, month))?.snapshot : null;

		let rows: OverviewRow[];
		if (snapshot) {
			const people = await this.store.identities(trx, Object.keys(snapshot.employees));
			rows = people.map((employee) => overviewRow(employee, snapshot.employees[employee.id]!));
		} else {
			// open, or locked by a first closing that came after it and left no snapshot
			const people = await this.closings.employed(trx, monthRange(month));
			const { figures } = await this.months.figures(
				trx,
				people.map((person) => person.id),
				month,
				now
			);
			rows = people.flatMap((employee) => {
				const found = figures.get(employee.id);
				return found ? [overviewRow(employee, found.row)] : [];
			});
		}
		return { month, closed, rows, generatedAt: now.toISOString() };
	}
}
