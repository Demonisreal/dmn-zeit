import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import {
	add,
	allocate,
	compare,
	daysForRange,
	fraction,
	negate,
	parseDecimal,
	sickRefund,
	subtract,
	toDecimal,
	type DayCost,
	type Fraction,
	type TakenDay
} from '@zeit/rules';
import { hasRole, isoDateSchema, uuidSchema } from '@zeit/shared';
import type {
	Absence,
	AbsencePage,
	AbsencePreview,
	AbsencesQuery,
	AbsenceType,
	ApiError,
	ApproveInput,
	CancelAbsenceInput,
	CreateAbsenceInput,
	RejectInput,
	TeamCalendar,
	TeamCalendarQuery
} from '@zeit/shared';
import { sql, type Expression, type SqlBool } from 'kysely';
import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { Clock } from '../common/clock';
import { assertCanSee } from '../common/scope';
import type { AuthSession } from '../common/session.guard';
import { Database, type Trx } from '../db/database';
import { MailQueue } from '../mail/mail.queue';
import { MailTransport } from '../mail/mail.transport';
import { buildDays, localDate } from '../time/day-engine';
import { flexBalance } from '../time/flex-balance';
import { TimeStore } from '../time/time.store';
import {
	berlinToday,
	bucketsOf,
	type BucketState,
	charge,
	heldPerYear,
	instantOf,
	paidBy,
	perYear,
	usableDays
} from '../vacation/buckets';
import { sickRefundMail } from '../vacation/vacation.mail';
import { holidaysBetween, VacationStore } from '../vacation/vacation.store';
import { AbsencesStore, type ActiveDay, type Filter } from './absences.store';

type Range = Pick<
	CreateAbsenceInput,
	'employeeId' | 'startDate' | 'endDate' | 'halfDayStart' | 'halfDayEnd'
>;

type Worked = DayCost & { portion: 0.5 | 1 };

const MAX_DAYS = 366;
const zero = fraction(0);
const cursorSchema = z.tuple([isoDateSchema, uuidSchema]);

function notInState(): ConflictException {
	return new ConflictException({
		code: 'INVALID_STATE',
		message: 'Not possible in the current state',
		details: null
	} satisfies ApiError);
}

function ownDecision(): ForbiddenException {
	return new ForbiddenException({
		code: 'FORBIDDEN',
		message: 'Nobody decides on their own absence',
		details: null
	} satisfies ApiError);
}

function badInput(field: string, code: string, message: string, params?: Record<string, number>) {
	return new BadRequestException({
		code: 'VALIDATION',
		message: 'Invalid input',
		details: [{ field, code, message, ...(params && { params }) }]
	} satisfies ApiError);
}

const takenDay = (day: ActiveDay): TakenDay => ({
	date: Temporal.PlainDate.from(day.date),
	vacationDays: parseDecimal(day.vacationDays)
});

function encodeCursor(absence: Absence): string {
	return Buffer.from(`${absence.startDate}|${absence.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { date: string; id: string } {
	const parsed = cursorSchema.safeParse(Buffer.from(cursor, 'base64url').toString().split('|'));
	if (!parsed.success) throw badInput('cursor', 'invalid_format', 'Invalid cursor');
	const [date, id] = parsed.data;
	return { date, id };
}

@Injectable()
export class AbsencesService {
	constructor(
		private readonly db: Database,
		private readonly store: AbsencesStore,
		private readonly vacation: VacationStore,
		private readonly time: TimeStore,
		private readonly mail: MailTransport,
		private readonly queue: MailQueue,
		private readonly clock: Clock
	) {}

	preview(session: AuthSession, input: CreateAbsenceInput): Promise<AbsencePreview> {
		const today = berlinToday(this.clock.now());
		return this.db.withTenant(session, async (trx) => {
			await assertCanSee(trx, session, input.employeeId);
			const days = await this.costs(trx, input);
			const costOf = (day: DayCost) => (input.type === 'vacation' ? day.vacationDays : zero);
			const total = days.reduce((sum, day) => add(sum, costOf(day)), zero);

			let allocations: AbsencePreview['allocations'] = [];
			let remainingAfter: string | null = null;
			if (input.type === 'vacation') {
				const buckets = (await this.buckets(trx, [input.employeeId], today)).get(input.employeeId)!;
				const plan = allocate(
					days,
					buckets.map((bucket) => bucket.payable)
				);
				allocations = [...perYear(plan.allocations)].map(([bucketYear, drawn]) => ({
					bucketYear,
					days: toDecimal(drawn, 2)
				}));
				const pending = parseDecimal(await this.vacation.pendingDays(trx, input.employeeId));
				remainingAfter = toDecimal(subtract(subtract(usableDays(buckets), pending), total), 2);
			}

			return {
				days: days.map((day) => ({
					date: day.date.toString(),
					portion: day.portion,
					targetMinutes: day.targetMinutes,
					vacationDays: toDecimal(costOf(day), 2),
					explanation: day.explanation
				})),
				vacationDays: toDecimal(total, 2),
				targetMinutes: days.reduce((minutes, day) => minutes + day.targetMinutes, 0),
				allocations,
				remainingAfter,
				overlapsWith: await this.store.overlapping(
					trx,
					input.employeeId,
					input.startDate,
					input.endDate
				)
			};
		});
	}

	create(session: AuthSession, input: CreateAbsenceInput): Promise<Absence> {
		return this.db.withTenant(session, async (trx) => {
			await assertCanSee(trx, session, input.employeeId);
			const days = await this.costs(trx, input);
			const id = await this.store.insert(trx, {
				employeeId: input.employeeId,
				type: input.type,
				startDate: input.startDate,
				endDate: input.endDate,
				halfDayStart: input.halfDayStart,
				halfDayEnd: input.halfDayEnd,
				note: input.note ?? null,
				requestedBy: session.userId
			});
			const taken =
				input.type === 'sick'
					? await this.store.takenDates(trx, input.employeeId, input.startDate, input.endDate)
					: new Set<string>();
			await this.insertDays(trx, id, input.employeeId, input.type, days, taken);
			return (await this.store.find(trx, id))!;
		});
	}

	async list(session: AuthSession, query: AbsencesQuery): Promise<AbsencePage> {
		if (query.scope !== 'mine' && !hasRole(session.role, 'team_lead')) {
			throw new ForbiddenException('Not allowed for your role');
		}
		const own = session.employeeId;
		if (query.scope === 'mine' && !own) return { items: [], nextCursor: null };
		const after = query.cursor ? decodeCursor(query.cursor) : null;
		const leadOnly = !hasRole(session.role, 'hr');

		const filter: Filter = (eb) => {
			const leads = sql<boolean>`app.leads(${eb.ref('r.employee_id')})`;
			const where: Expression<SqlBool>[] = [];
			if (query.to) where.push(eb('r.start_date', '<=', query.to));
			if (query.from) where.push(eb('r.end_date', '>=', query.from));
			if (query.scope === 'mine') where.push(eb('r.employee_id', '=', own!));
			if (query.scope === 'inbox') {
				where.push(eb('r.status', 'in', ['pending', 'cancel_pending']));
				where.push(eb('r.requested_by', '!=', session.userId));
				if (own) where.push(eb('r.employee_id', '!=', own));
			}
			if (query.scope !== 'mine' && leadOnly) where.push(leads);
			if (query.employee) where.push(eb('r.employee_id', '=', query.employee));
			if (query.status) where.push(eb('r.status', 'in', query.status));
			if (query.type) where.push(eb('r.type', 'in', query.type));
			if (after) {
				where.push(eb(eb.refTuple('r.start_date', 'r.id'), '>', eb.tuple(after.date, after.id)));
			}
			return eb.and(where);
		};

		return this.db.withTenant(session, async (trx) => {
			const items = await this.store.list(trx, filter, query.limit + 1);
			const more = items.length > query.limit;
			const page = more ? items.slice(0, query.limit) : items;
			return {
				items: query.scope === 'inbox' ? await this.forDecision(trx, page) : page,
				nextCursor: more ? encodeCursor(page.at(-1)!) : null
			};
		});
	}

	approve(session: AuthSession, id: string, input: ApproveInput): Promise<Absence> {
		const today = berlinToday(this.clock.now());
		const decision = { userId: session.userId, note: input.note ?? null };
		return this.db.withTenant(session, async (trx) => {
			const absence = await this.decidable(trx, session, id);
			if (absence.status === 'pending') {
				if (!(await this.store.decide(trx, id, 'pending', 'approved', decision)))
					throw notInState();
				if (absence.type === 'vacation') await this.bookTaken(trx, session, absence, today);
			} else if (absence.status === 'cancel_pending') {
				if (!(await this.store.decide(trx, id, 'cancel_pending', 'cancelled', decision))) {
					throw notInState();
				}
				await this.store.supersede(trx, { absenceId: id }, null);
				await this.refundCancel(trx, session, absence, today);
			} else {
				throw notInState();
			}
			return (await this.store.find(trx, id))!;
		});
	}

	reject(session: AuthSession, id: string, input: RejectInput): Promise<Absence> {
		const decision = { userId: session.userId, note: input.note };
		return this.db.withTenant(session, async (trx) => {
			const absence = await this.decidable(trx, session, id);
			if (absence.status === 'pending') {
				if (!(await this.store.decide(trx, id, 'pending', 'rejected', decision)))
					throw notInState();
				await this.store.supersede(trx, { absenceId: id }, null);
			} else if (absence.status === 'cancel_pending') {
				if (!(await this.store.decide(trx, id, 'cancel_pending', 'approved', decision))) {
					throw notInState();
				}
			} else {
				throw notInState();
			}
			return (await this.store.find(trx, id))!;
		});
	}

	withdraw(session: AuthSession, id: string): Promise<Absence> {
		return this.db.withTenant(session, async (trx) => {
			const absence = await this.visible(trx, session, id);
			if (absence.employee.id !== session.employeeId && absence.requestedBy.id !== session.userId) {
				throw new ForbiddenException('Only the person asking can withdraw');
			}
			if (!(await this.store.move(trx, id, 'pending', 'withdrawn', null))) throw notInState();
			await this.store.supersede(trx, { absenceId: id }, null);
			return (await this.store.find(trx, id))!;
		});
	}

	cancel(session: AuthSession, id: string, input: CancelAbsenceInput): Promise<Absence> {
		const today = berlinToday(this.clock.now());
		return this.db.withTenant(session, async (trx) => {
			const absence = await this.visible(trx, session, id);
			if (absence.employee.id !== session.employeeId) {
				throw new ForbiddenException('Only the person on leave can cancel');
			}
			if (absence.endDate < today.toString()) throw notInState();
			if (absence.sickNote) throw notInState();
			if (!(await this.store.move(trx, id, 'approved', 'cancel_pending', input.note ?? null))) {
				throw notInState();
			}
			return (await this.store.find(trx, id))!;
		});
	}

	async confirmSickNote(session: AuthSession, id: string): Promise<Absence> {
		const today = berlinToday(this.clock.now());
		const { absence, mail } = await this.db.withTenant(session, async (trx) => {
			const sick = await this.visible(trx, session, id);
			if (sick.employee.id === session.employeeId) throw ownDecision();
			if (sick.type !== 'sick' || sick.status !== 'approved') throw notInState();
			if (!(await this.store.confirmCertificate(trx, id, session.userId))) throw notInState();

			const employeeId = sick.employee.id;
			const taken = await this.store.vacationWithin(trx, employeeId, sick.startDate, sick.endDate);
			const sickDates: Temporal.PlainDate[] = [];
			for (
				let date = Temporal.PlainDate.from(sick.startDate);
				Temporal.PlainDate.compare(date, Temporal.PlainDate.from(sick.endDate)) <= 0;
				date = date.add({ days: 1 })
			) {
				sickDates.push(date);
			}
			const refund = sickRefund(taken.map(takenDay), sickDates);
			const back = new Set(refund.dates.map((date) => date.toString()));
			const refunded = taken.filter((day) => back.has(day.date));

			if (refunded.length > 0) {
				await this.refundSick(trx, session, employeeId, refunded, today);
				await this.store.supersede(trx, { dayIds: refunded.map((day) => day.id) }, id);
			}
			const days = await this.costs(trx, { ...sick, employeeId });
			const occupied = await this.store.takenDates(trx, employeeId, sick.startDate, sick.endDate);
			await this.insertDays(trx, id, employeeId, 'sick', days, occupied);

			const absence = (await this.store.find(trx, id))!;
			if (refunded.length === 0) return { absence, mail: null };

			const recipient = (await this.vacation.recipients(trx, [employeeId])).get(employeeId);
			return {
				absence,
				mail: recipient && {
					to: recipient.email,
					...sickRefundMail(recipient.locale, {
						name: recipient.displayName,
						from: sick.startDate,
						to: sick.endDate,
						days: toDecimal(refund.days, 2),
						dates: [...back]
					})
				}
			};
		});

		if (mail) this.queue.later(() => this.mail.send({ tenantId: session.tenantId, ...mail }));
		return absence;
	}

	teamCalendar(session: AuthSession, query: TeamCalendarQuery): Promise<TeamCalendar> {
		const first = Temporal.PlainYearMonth.from(query.month).toPlainDate({ day: 1 });
		const last = first.add({ months: 1 }).subtract({ days: 1 });
		return this.db.withTenant(session, async (trx) => {
			const team = query.team ?? (await this.homeTeam(trx, session));
			const { rows } = await sql<{
				employee_id: string;
				display_name: string;
				date: string;
				portion: string;
				type: AbsenceType | null;
				status: 'pending' | 'approved' | 'cancel_pending' | null;
			}>`select employee_id, display_name, date, portion, type, status
				from app.team_absence_days(${first.toString()}, ${last.toString()}, ${team})`.execute(trx);

			const people = new Map<string, TeamCalendar['people'][number]>();
			for (const row of rows) {
				let person = people.get(row.employee_id);
				if (!person) {
					person = { employee: { id: row.employee_id, name: row.display_name }, days: [] };
					people.set(row.employee_id, person);
				}
				person.days.push({
					date: row.date,
					portion: Number(row.portion) === 0.5 ? 0.5 : 1,
					type: row.type ?? 'absent',
					status: row.status
				});
			}

			const calendar = await this.vacation.calendar(trx);
			return {
				month: query.month,
				holidays: holidaysBetween(calendar, first, last).map((holiday) => ({
					date: holiday.date.toString(),
					code: holiday.code,
					portion: holiday.portion
				})),
				people: [...people.values()]
			};
		});
	}

	private async forDecision(trx: Trx, page: Absence[]): Promise<Absence[]> {
		const now = this.clock.now();
		const today = berlinToday(now);
		const ofType = (type: AbsenceType) => page.filter((absence) => absence.type === type);
		const peopleOf = (type: AbsenceType) => [
			...new Set(ofType(type).map((absence) => absence.employee.id))
		];

		const concurrent = await this.store.concurrent(
			trx,
			page.map((absence) => absence.id)
		);
		const onLeave = peopleOf('vacation');
		const pending = await this.vacation.pendingByEmployee(trx, onLeave);
		const left = new Map<string, Fraction>();
		for (const [employeeId, buckets] of await this.buckets(trx, onLeave, today)) {
			const open = parseDecimal(pending.get(employeeId) ?? '0.00');
			left.set(employeeId, subtract(usableDays(buckets), open));
		}
		const balances = await this.flexBalances(trx, peopleOf('time_off'), now);
		const ahead = await this.store.minutesAfter(
			trx,
			ofType('time_off').map((absence) => absence.id),
			today.toString()
		);

		return page.map((absence) => {
			const detailed: Absence = {
				...absence,
				concurrentAbsences: concurrent.get(absence.id) ?? []
			};
			const cancelling = absence.status === 'cancel_pending';
			if (absence.type === 'vacation') {
				const back = cancelling ? parseDecimal(absence.vacationDays) : zero;
				detailed.remainingAfter = toDecimal(add(left.get(absence.employee.id)!, back), 2);
			}
			if (absence.type === 'time_off') {
				const taken = cancelling ? 0 : (ahead.get(absence.id) ?? 0);
				detailed.balanceAfterMinutes = balances.get(absence.employee.id)! - taken;
			}
			return detailed;
		});
	}

	private async flexBalances(
		trx: Trx,
		employeeIds: readonly string[],
		now: Date
	): Promise<Map<string, number>> {
		if (employeeIds.length === 0) return new Map();
		const today = localDate(now);
		const year = Number(today.slice(0, 4));
		const counted = { from: `${year}-01-01`, to: today };
		const { tenant, sheets } = await this.time.sheets(trx, employeeIds, counted);
		const bookings = await this.time.flexBookings(trx, employeeIds, counted);
		const carryovers = await this.time.checkpoints(trx, [...sheets.keys()], year);

		const balances = new Map<string, number>();
		for (const [employeeId, sheet] of sheets) {
			const days = buildDays(sheet, tenant, counted, now);
			balances.set(
				employeeId,
				flexBalance(sheet, days, bookings, carryovers, today).balanceMinutes
			);
		}
		return balances;
	}

	private async costs(trx: Trx, range: Range): Promise<DayCost[]> {
		const start = Temporal.PlainDate.from(range.startDate);
		const end = Temporal.PlainDate.from(range.endDate);
		if (start.until(end).days + 1 > MAX_DAYS) {
			throw badInput('endDate', 'custom', 'range.tooLong', { max: MAX_DAYS });
		}
		const employment = await this.vacation.employment(trx, range.employeeId);
		if (!employment) throw new NotFoundException('Employee not found');
		const calendar = await this.vacation.calendar(trx);
		return daysForRange(
			{ start, end, halfDayStart: range.halfDayStart, halfDayEnd: range.halfDayEnd },
			employment,
			holidaysBetween(calendar, start, end)
		);
	}

	private async insertDays(
		trx: Trx,
		absenceId: string,
		employeeId: string,
		type: AbsenceType,
		days: DayCost[],
		skip: Set<string>
	): Promise<void> {
		const worked = days.filter(
			(day): day is Worked => day.portion > 0 && !skip.has(day.date.toString())
		);
		await this.store.insertDays(
			trx,
			worked.map((day) => ({
				employeeId,
				absenceId,
				date: day.date.toString(),
				portion: day.portion,
				targetMinutes: day.targetMinutes,
				vacationDays: type === 'vacation' ? toDecimal(day.vacationDays, 2) : '0.00'
			}))
		);
	}

	private async buckets(
		trx: Trx,
		employeeIds: readonly string[],
		today: Temporal.PlainDate
	): Promise<Map<string, BucketState[]>> {
		if (employeeIds.length === 0) return new Map();
		const { carryoverUntil } = await this.vacation.calendar(trx);
		const ledgers = await this.vacation.ledgerByEmployee(trx, employeeIds);
		const notices = await this.vacation.noticesByEmployee(trx, employeeIds);
		return new Map(
			employeeIds.map((employeeId) => [
				employeeId,
				bucketsOf(
					ledgers.get(employeeId) ?? [],
					notices.get(employeeId) ?? [],
					carryoverUntil,
					today
				)
			])
		);
	}

	private async visible(trx: Trx, session: AuthSession, id: string): Promise<Absence> {
		const absence = await this.store.find(trx, id);
		if (!absence) throw new NotFoundException('Absence not found');
		await assertCanSee(trx, session, absence.employee.id);
		return absence;
	}

	private async decidable(trx: Trx, session: AuthSession, id: string): Promise<Absence> {
		const absence = await this.visible(trx, session, id);
		if (absence.employee.id === session.employeeId || absence.requestedBy.id === session.userId) {
			throw ownDecision();
		}
		return absence;
	}

	private async bookTaken(
		trx: Trx,
		session: AuthSession,
		absence: Absence,
		today: Temporal.PlainDate
	): Promise<void> {
		const employeeId = absence.employee.id;
		const days = (await this.store.activeDays(trx, absence.id)).map(takenDay);
		const buckets = (await this.buckets(trx, [employeeId], today)).get(employeeId)!;
		const costs = charge(
			days,
			buckets.map((bucket) => bucket.payable)
		);
		await this.vacation.book(
			trx,
			[...costs].map(([bucketYear, drawn]) => ({
				employeeId,
				bucketYear,
				entryType: 'taken' as const,
				days: toDecimal(negate(drawn), 2),
				effectiveDate: today.toString(),
				absenceId: absence.id,
				createdBy: session.userId
			}))
		);
	}

	private async refundCancel(
		trx: Trx,
		session: AuthSession,
		absence: Absence,
		today: Temporal.PlainDate
	): Promise<void> {
		const own = (await this.vacation.ledger(trx, absence.employee.id)).filter(
			(entry) => entry.absenceId === absence.id
		);
		await this.vacation.book(
			trx,
			[...heldPerYear(own)]
				.filter(([, held]) => compare(held, zero) > 0)
				.map(([bucketYear, held]) => ({
					employeeId: absence.employee.id,
					bucketYear,
					entryType: 'refund_cancel' as const,
					days: toDecimal(held, 2),
					effectiveDate: today.toString(),
					absenceId: absence.id,
					createdBy: session.userId
				}))
		);
	}

	private async refundSick(
		trx: Trx,
		session: AuthSession,
		employeeId: string,
		refunded: ActiveDay[],
		today: Temporal.PlainDate
	): Promise<void> {
		const { carryoverUntil } = await this.vacation.calendar(trx);
		const ledger = await this.vacation.ledger(trx, employeeId);
		const notices = await this.vacation.notices(trx, employeeId);

		for (const absenceId of new Set(refunded.map((day) => day.absenceId))) {
			const own = ledger.filter((entry) => entry.absenceId === absenceId);
			const approval = own.find((entry) => entry.entryType === 'taken');
			if (!approval) continue;

			const approvedAt = instantOf(approval.createdAt);
			const split = paidBy(
				(await this.store.activeDays(trx, absenceId)).map(takenDay),
				own,
				notices.filter(
					(notice) => Temporal.Instant.compare(instantOf(notice.sentAt), approvedAt) < 0
				),
				carryoverUntil,
				Temporal.PlainDate.from(approval.effectiveDate)
			);
			const dates = new Set(
				refunded.filter((day) => day.absenceId === absenceId).map((day) => day.date)
			);
			const back = perYear(split.filter((allocation) => dates.has(allocation.date.toString())));
			await this.vacation.book(
				trx,
				[...back].map(([bucketYear, days]) => ({
					employeeId,
					bucketYear,
					entryType: 'refund_sick' as const,
					days: toDecimal(days, 2),
					effectiveDate: today.toString(),
					absenceId,
					createdBy: session.userId
				}))
			);
		}
	}

	private async homeTeam(trx: Trx, session: AuthSession): Promise<string> {
		const led = await trx
			.selectFrom('app.team_leads')
			.select('team_id')
			.where('user_id', '=', session.userId)
			.execute();
		if (led.length === 1) return led[0]!.team_id;

		if (session.employeeId) {
			const own = await trx
				.selectFrom('app.employees')
				.select('team_id')
				.where('id', '=', session.employeeId)
				.executeTakeFirst();
			if (own?.team_id) return own.team_id;
		}
		throw badInput('team', 'invalid_type', 'Required');
	}
}
