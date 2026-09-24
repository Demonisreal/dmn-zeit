import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import {
	annualEntitlement,
	compare,
	fraction,
	isZero,
	parseDecimal,
	subtract,
	toDecimal
} from '@zeit/rules';
import type {
	ApiError,
	CreateVacationAdjustmentInput,
	CreateVacationNoticesInput,
	VacationAccount,
	VacationLedgerEntry,
	VacationNotice
} from '@zeit/shared';
import { hasRole } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { Clock } from '../common/clock';
import { assertCanSee } from '../common/scope';
import type { AuthSession } from '../common/session.guard';
import { Database } from '../db/database';
import { MailQueue } from '../mail/mail.queue';
import { MailTransport } from '../mail/mail.transport';
import { berlinToday, bucketsOf, deadlineOf, usableDays } from './buckets';
import { leaveNoticeMail, NOTICE_TEXT_VERSION } from './vacation.mail';
import { VacationStore } from './vacation.store';

export function notOwnAccount(): ForbiddenException {
	return new ForbiddenException({
		code: 'FORBIDDEN',
		message: 'Bookings on your own account need a second person',
		details: null
	} satisfies ApiError);
}

@Injectable()
export class VacationService {
	constructor(
		private readonly db: Database,
		private readonly store: VacationStore,
		private readonly mail: MailTransport,
		private readonly queue: MailQueue,
		private readonly clock: Clock
	) {}

	account(session: AuthSession, employeeId: string, year: number): Promise<VacationAccount> {
		const today = berlinToday(this.clock.now());
		return this.db.withTenant(session, async (trx) => {
			await assertCanSee(trx, session, employeeId);
			const employment = await this.store.employment(trx, employeeId);
			if (!employment) throw new NotFoundException('Employee not found');

			const { carryoverUntil } = await this.store.calendar(trx);
			const entries = await this.store.ledger(trx, employeeId);
			const notices = await this.store.notices(trx, employeeId);
			const pending = parseDecimal(await this.store.pendingDays(trx, employeeId));

			const newYearsEve = Temporal.PlainDate.from({ year, month: 12, day: 31 });
			const entitlement = annualEntitlement(
				employment,
				year,
				Temporal.PlainDate.compare(today, newYearsEve) < 0 ? today : newYearsEve
			);
			// older buckets only while days are left in them, kept for lack of a notice
			const buckets = bucketsOf(entries, notices, carryoverUntil, today).filter(
				(bucket) => bucket.year <= year && (bucket.year >= year - 1 || !isZero(bucket.remaining))
			);
			const shown = new Set(buckets.map((bucket) => bucket.year));

			return {
				employeeId,
				year,
				entitlement: {
					days: toDecimal(entitlement.rounded, 2),
					explanations: entitlement.explanations
				},
				buckets: buckets.map((bucket) => ({
					year: bucket.year,
					entitlement: toDecimal(bucket.entitlement, 2),
					taken: toDecimal(bucket.taken, 2),
					refunded: toDecimal(bucket.refunded, 2),
					adjusted: toDecimal(bucket.adjusted, 2),
					expired: toDecimal(bucket.expired, 2),
					remaining: toDecimal(bucket.remaining, 2),
					deadline: bucket.deadline.toString(),
					notice: bucket.notice && {
						id: bucket.notice.id,
						sentAt: bucket.notice.sentAt,
						deadline: bucket.notice.deadline,
						acknowledgedAt: bucket.notice.acknowledgedAt
					},
					expiry: { decision: bucket.expiry.kind, explanation: bucket.expiry.explanation }
				})),
				pending: toDecimal(pending, 2),
				available: toDecimal(subtract(usableDays(buckets), pending), 2),
				ledger: entries.filter((entry) => shown.has(entry.bucketYear))
			};
		});
	}

	adjust(
		session: AuthSession,
		employeeId: string,
		input: CreateVacationAdjustmentInput
	): Promise<VacationLedgerEntry> {
		if (employeeId === session.employeeId) throw notOwnAccount();
		return this.db.withTenant(session, async (trx) => {
			if (!(await this.store.employees(trx, [employeeId])).has(employeeId)) {
				throw new NotFoundException('Employee not found');
			}
			const [entry] = await this.store.book(trx, [
				{
					employeeId,
					bucketYear: input.bucketYear,
					entryType: 'adjustment',
					days: input.days,
					effectiveDate: input.effectiveDate,
					reason: input.reason,
					createdBy: session.userId
				}
			]);
			return entry!;
		});
	}

	async sendNotices(
		session: AuthSession,
		input: CreateVacationNoticesInput
	): Promise<VacationNotice[]> {
		const today = berlinToday(this.clock.now());
		const employeeIds = [...new Set(input.employeeIds)];

		const { notices, mails } = await this.db.withTenant(session, async (trx) => {
			const { carryoverUntil } = await this.store.calendar(trx);
			const deadline = deadlineOf(input.bucketYear, carryoverUntil);
			// a notice has to leave time to take the days, one after the deadline cannot do that
			if (Temporal.PlainDate.compare(deadline, today) < 0) {
				throw new ConflictException({
					code: 'INVALID_STATE',
					message: 'The carry-over deadline of this leave year has passed',
					details: { deadline: deadline.toString() }
				} satisfies ApiError);
			}

			const people = await this.store.employees(trx, employeeIds);
			const unknown = employeeIds.filter((id) => !people.has(id));
			if (unknown.length > 0) {
				throw new NotFoundException({
					code: 'NOT_FOUND',
					message: 'Employee not found',
					details: { employeeIds: unknown }
				} satisfies ApiError);
			}

			const recipients = await this.store.recipients(trx, employeeIds);
			const unreachable = employeeIds.filter((id) => !recipients.has(id));
			if (input.channel === 'email' && unreachable.length > 0) {
				throw new ConflictException({
					code: 'INVALID_STATE',
					message: 'No email address for some of the employees',
					details: { employeeIds: unreachable }
				} satisfies ApiError);
			}

			const remaining = await this.store.remainingIn(trx, input.bucketYear, employeeIds);
			// an overdrawn bucket has nothing left to forfeit, the notice then says zero
			const left = (id: string) => {
				const days = parseDecimal(remaining.get(id) ?? '0');
				return toDecimal(compare(days, fraction(0)) > 0 ? days : fraction(0), 2);
			};
			const ids = await this.store.insertNotices(
				trx,
				employeeIds.map((employeeId) => ({
					employeeId,
					bucketYear: input.bucketYear,
					remainingDays: left(employeeId),
					deadline: deadline.toString(),
					sentBy: session.userId,
					channel: input.channel,
					textVersion: NOTICE_TEXT_VERSION
				}))
			);
			const notices = await this.store.noticeList(trx, { ids });
			if (input.channel !== 'email') return { notices, mails: [] };

			const mails = [...recipients].map(([employeeId, recipient]) => ({
				to: recipient.email,
				...leaveNoticeMail(recipient.locale, {
					name: recipient.displayName,
					year: input.bucketYear,
					days: left(employeeId),
					deadline: deadline.toString()
				})
			}));
			return { notices, mails };
		});

		this.queue.later(async () => {
			for (const mail of mails) await this.mail.send({ tenantId: session.tenantId, ...mail });
		});
		return notices;
	}

	notices(session: AuthSession, year: number): Promise<VacationNotice[]> {
		return this.db.withTenant(session, (trx) =>
			this.store.noticeList(trx, {
				year,
				...(!hasRole(session.role, 'hr') && {
					visibleTo: { employeeId: session.employeeId, leads: session.role === 'team_lead' }
				})
			})
		);
	}

	acknowledge(session: AuthSession, id: string): Promise<VacationNotice> {
		const employeeId = session.employeeId;
		if (!employeeId) throw new NotFoundException('Notice not found');
		return this.db.withTenant(session, async (trx) => {
			const acknowledged = await this.store.acknowledge(trx, id, employeeId);
			const [notice] = await this.store.noticeList(trx, {
				ids: [id],
				visibleTo: { employeeId, leads: false }
			});
			if (!notice) throw new NotFoundException('Notice not found');
			if (!acknowledged) {
				throw new ConflictException({
					code: 'INVALID_STATE',
					message: 'The notice was already acknowledged',
					details: null
				} satisfies ApiError);
			}
			return notice;
		});
	}
}
