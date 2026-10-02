import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import { hasRole } from '@zeit/shared';
import type {
	CreateProjectEntryInput,
	EntriesQuery,
	ProjectEntry,
	UpdateProjectEntryInput
} from '@zeit/shared';
import type { Client } from '../common/client.decorator';
import { assertCanSee } from '../common/scope';
import type { AuthSession } from '../common/session.guard';
import { Database } from '../db/database';
import { employeeOf } from '../time/clock.service';
import { decodeCursor, encodeCursor } from '../time/cursor';
import { ProjectEntriesStore } from './project-entries.store';

export type ProjectEntryPage = { items: ProjectEntry[]; nextCursor: string | null };

@Injectable()
export class ProjectEntriesService {
	constructor(
		private readonly db: Database,
		private readonly store: ProjectEntriesStore
	) {}

	page(session: AuthSession, employeeId: string, query: EntriesQuery): Promise<ProjectEntryPage> {
		const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
		return this.db.withTenant(session, async (trx) => {
			await assertCanSee(trx, session, employeeId);
			const rows = await this.store.page(trx, employeeId, query, after, query.limit + 1);
			const items = rows.slice(0, query.limit);
			const last = items.at(-1);
			return {
				items,
				nextCursor: rows.length > query.limit && last ? encodeCursor(last.startedAt, last.id) : null
			};
		});
	}

	create(
		session: AuthSession,
		input: CreateProjectEntryInput,
		other: { employeeId: string; reason: string } | null,
		client: Client
	): Promise<ProjectEntry> {
		return this.db.withTenant(session, async (trx) => {
			if (!other || other.employeeId === session.employeeId) {
				return this.store.insert(trx, session, employeeOf(session), input);
			}
			if (!hasRole(session.role, 'hr')) {
				throw new ForbiddenException('Only hr books time for someone else');
			}
			if (!(await this.store.hasEmployee(trx, other.employeeId))) {
				throw new NotFoundException('Employee not found');
			}
			const entry = await this.store.insert(trx, session, other.employeeId, input);
			await this.store.bookedForOther(trx, session, entry, other.reason, client);
			return entry;
		});
	}

	update(session: AuthSession, id: string, input: UpdateProjectEntryInput): Promise<ProjectEntry> {
		return this.db.withTenant(session, async (trx) => {
			const entry = await this.store.entry(trx, id);
			if (!entry) throw new NotFoundException('Project entry not found');
			if (entry.endedAt === null) {
				throw new ConflictException('A running entry is stopped through the timer');
			}
			if (Object.keys(input).length === 0) return entry;

			const updated = await this.store.update(trx, id, input);
			if (!updated) throw new ForbiddenException('Not allowed to change this entry');
			return updated;
		});
	}

	voidEntry(session: AuthSession, id: string): Promise<ProjectEntry> {
		return this.db.withTenant(session, async (trx) => {
			const entry = await this.store.entry(trx, id);
			if (!entry) throw new NotFoundException('Project entry not found');
			if (entry.voidedAt) throw new ConflictException('The entry is already voided');

			const voided = await this.store.voidEntry(trx, id);
			if (!voided) throw new ForbiddenException('Not allowed to change this entry');
			return voided;
		});
	}
}
