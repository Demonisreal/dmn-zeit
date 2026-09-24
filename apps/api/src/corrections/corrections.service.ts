import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import { hasRole } from '@zeit/shared';
import type {
	ApiError,
	ApproveInput,
	Correction,
	CorrectionPage,
	CorrectionsQuery,
	CreateCorrectionInput,
	RejectInput
} from '@zeit/shared';
import { assertCanSee } from '../common/scope';
import type { AuthSession } from '../common/session.guard';
import { Database, type Trx } from '../db/database';
import { decodeCursor, encodeCursor } from '../time/cursor';
import { CorrectionsStore, type Decision } from './corrections.store';

const periodLocked = {
	code: 'PERIOD_LOCKED',
	message: 'The month is already closed',
	details: null
} satisfies ApiError;

@Injectable()
export class CorrectionsService {
	constructor(
		private readonly db: Database,
		private readonly store: CorrectionsStore
	) {}

	// own times always wait for a second person; hr corrects anyone else's right away
	create(session: AuthSession, input: CreateCorrectionInput): Promise<Correction> {
		return this.db.withTenant(session, async (trx) => {
			let employeeId: string;
			let target: { id: string; startedAt: string } | null = null;
			if (input.action === 'add') {
				employeeId = input.employeeId;
			} else {
				const entry = await this.store.entry(trx, input.entryId);
				if (!entry) throw new NotFoundException('Entry not found');
				if (entry.voidedAt) throw new ConflictException('The entry is already voided');
				employeeId = entry.employeeId;
				target = entry;
			}
			const span = input.action === 'void' ? null : input;
			const direct = employeeId !== session.employeeId;
			if (direct && !hasRole(session.role, 'hr')) {
				throw new ForbiddenException('Only hr corrects the times of someone else');
			}

			const stamps = [target?.startedAt, span?.startedAt].filter((at) => at !== undefined);
			if (!direct && (await this.store.touchesClosedMonth(trx, employeeId, stamps))) {
				throw new ConflictException(periodLocked);
			}

			const id = await this.store.insert(trx, session, {
				employeeId,
				action: input.action,
				targetEntryId: target?.id ?? null,
				startedAt: span?.startedAt ?? null,
				endedAt: span?.endedAt ?? null,
				reason: input.reason,
				direct
			});
			const correction = await this.found(trx, id);
			if (direct) await this.apply(trx, session, correction);
			return correction;
		});
	}

	list(session: AuthSession, query: CorrectionsQuery): Promise<CorrectionPage> {
		if (query.scope !== 'mine' && !hasRole(session.role, 'team_lead')) {
			throw new ForbiddenException('Only leads and hr see the corrections of others');
		}
		const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);

		return this.db.withTenant(session, async (trx) => {
			if (query.employee) await assertCanSee(trx, session, query.employee);
			const rows = await this.store.page(trx, session, query, after);
			const items = rows.slice(0, query.limit);
			const last = items.at(-1);
			return {
				items,
				nextCursor: rows.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : null
			};
		});
	}

	approve(session: AuthSession, id: string, input: ApproveInput): Promise<Correction> {
		return this.decide(session, id, { status: 'approved', note: input.note ?? null });
	}

	reject(session: AuthSession, id: string, input: RejectInput): Promise<Correction> {
		return this.decide(session, id, { status: 'rejected', note: input.note });
	}

	withdraw(session: AuthSession, id: string): Promise<Correction> {
		return this.db.withTenant(session, async (trx) => {
			const correction = await this.found(trx, id);
			if (correction.requestedBy.id !== session.userId) {
				throw new ForbiddenException('Only the requester can withdraw a correction');
			}
			if (!(await this.store.withdraw(trx, id))) {
				throw new ConflictException('The correction is no longer pending');
			}
			return this.found(trx, id);
		});
	}

	private decide(session: AuthSession, id: string, decision: Decision): Promise<Correction> {
		return this.db.withTenant(session, async (trx) => {
			const correction = await this.found(trx, id);
			// the trigger refuses this as well, but only with a bare permission error
			if (
				correction.requestedBy.id === session.userId ||
				correction.employee.id === session.employeeId
			) {
				throw new ForbiddenException('Nobody decides on corrections of their own times');
			}
			await assertCanSee(trx, session, correction.employee.id);
			if (!(await this.store.decide(trx, id, session.userId, decision))) {
				throw new ConflictException('The correction is no longer pending');
			}
			if (decision.status === 'approved') await this.apply(trx, session, correction);
			return this.found(trx, id);
		});
	}

	// void first, the new entry may overlap the one it replaces
	private async apply(trx: Trx, session: AuthSession, correction: Correction): Promise<void> {
		if (
			correction.target &&
			!(await this.store.voidEntry(trx, correction.target.entryId, correction.id))
		) {
			throw new ConflictException('The entry was voided in the meantime');
		}
		if (correction.newStartedAt && correction.newEndedAt) {
			await this.store.addEntry(trx, session, {
				employeeId: correction.employee.id,
				startedAt: correction.newStartedAt,
				endedAt: correction.newEndedAt,
				requestId: correction.id
			});
		}
	}

	private async found(trx: Trx, id: string): Promise<Correction> {
		const correction = await this.store.find(trx, id);
		if (!correction) throw new NotFoundException('Correction not found');
		return correction;
	}
}
