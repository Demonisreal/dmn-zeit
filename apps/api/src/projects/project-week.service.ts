import { Injectable, NotFoundException } from '@nestjs/common';
import { hasRole } from '@zeit/shared';
import type { ProjectSummary, ProjectSummaryQuery, ProjectWeek } from '@zeit/shared';
import { Clock } from '../common/clock';
import { assertCanSee } from '../common/scope';
import type { AuthSession } from '../common/session.guard';
import { Database, type Trx } from '../db/database';
import { TimeStore } from '../time/time.store';
import {
	NO_OVERRIDE,
	projectSummary,
	projectWeek,
	weekCoverage,
	weekOf,
	type Catalog
} from './project-engine';
import { ProjectEntriesStore } from './project-entries.store';
import { ProjectsStore } from './projects.store';

@Injectable()
export class ProjectWeekService {
	constructor(
		private readonly db: Database,
		private readonly entries: ProjectEntriesStore,
		private readonly projects: ProjectsStore,
		private readonly time: TimeStore,
		private readonly clock: Clock
	) {}

	week(session: AuthSession, employeeId: string, monday: string): Promise<ProjectWeek> {
		const range = weekOf(monday);
		return this.db.withTenant(session, async (trx) => {
			await assertCanSee(trx, session, employeeId);
			const rows = await this.entries.between(trx, range, { employeeId });
			const projectIds = rows.map((row) => row.projectId);
			const now = this.clock.now();

			const priced = hasRole(session.role, 'hr');
			const catalog = priced
				? await this.projects.catalog(trx, projectIds)
				: await this.unpricedCatalog(trx, projectIds);
			const clientIds = [...catalog.projects.values()].map((project) => project.clientId);
			const rates = priced ? await this.projects.ratesFor(trx, clientIds) : null;
			const week = projectWeek({ monday, rows, catalog, rates, now });

			if (session.workspace !== 'company') return { ...week, coverage: null };
			const { sheets } = await this.time.sheets(trx, [employeeId], range);
			const sheet = sheets.get(employeeId);
			if (!sheet) throw new NotFoundException('Employee not found');
			return { ...week, coverage: weekCoverage(monday, rows, sheet.entries, now) };
		});
	}

	summary(session: AuthSession, query: ProjectSummaryQuery): Promise<ProjectSummary> {
		return this.db.withTenant(session, async (trx) => {
			const rows = await this.entries.between(trx, query, { team: query.team });
			const employeeIds = [...new Set(rows.map((row) => row.employeeId))];
			const { sheets } = await this.time.sheets(trx, employeeIds, query);
			const labels = await this.projects.labels(
				trx,
				rows.map((row) => row.projectId)
			);
			const projectNames = new Map([...labels].map(([id, label]) => [id, label.name]));
			return projectSummary({ range: query, rows, sheets, projectNames, now: this.clock.now() });
		});
	}

	private async unpricedCatalog(trx: Trx, projectIds: readonly string[]): Promise<Catalog> {
		const [labels, bookable] = await Promise.all([
			this.projects.labels(trx, projectIds),
			this.projects.bookable(trx)
		]);
		const open = new Map(bookable.map((project) => [project.id, project]));
		const catalog: Catalog = { projects: new Map(), tasks: new Map() };
		for (const [id, label] of labels) {
			catalog.projects.set(id, {
				id,
				...label,
				clientId: '',
				billable: open.get(id)?.billable ?? true,
				budgetMinutes: null,
				client: NO_OVERRIDE,
				project: open.get(id)?.rounding ?? NO_OVERRIDE
			});
		}
		for (const project of bookable) {
			for (const task of project.tasks) {
				catalog.tasks.set(task.id, { ...task, projectId: project.id });
			}
		}
		return catalog;
	}
}
