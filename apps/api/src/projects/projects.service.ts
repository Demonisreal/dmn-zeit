import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
	ApiError,
	BookableProject,
	BudgetStatus,
	Client,
	CreateClientInput,
	CreateProjectInput,
	CreateRateInput,
	CreateTaskInput,
	Project,
	Rate,
	Task,
	UpdateClientInput,
	UpdateProjectInput,
	UpdateTaskInput
} from '@zeit/shared';
import { Clock } from '../common/clock';
import type { AuthSession } from '../common/session.guard';
import { Database, type Trx } from '../db/database';
import { employeeOf } from '../time/clock.service';
import { budgetOf } from './project-engine';
import { ProjectEntriesStore } from './project-entries.store';
import {
	metaOf,
	ProjectsStore,
	toProject,
	type ProjectMember,
	type ProjectRow,
	type RateFilter
} from './projects.store';

@Injectable()
export class ProjectsService {
	constructor(
		private readonly db: Database,
		private readonly store: ProjectsStore,
		private readonly entries: ProjectEntriesStore,
		private readonly clock: Clock
	) {}

	clients(session: AuthSession, includeArchived: boolean): Promise<Client[]> {
		return this.db.withTenant(session, (trx) => this.store.clients(trx, includeArchived));
	}

	client(session: AuthSession, id: string): Promise<Client> {
		return this.db.withTenant(session, async (trx) =>
			found(await this.store.client(trx, id), 'Client')
		);
	}

	createClient(session: AuthSession, input: CreateClientInput): Promise<Client> {
		return this.db.withTenant(session, (trx) =>
			this.store.insertClient(trx, session.tenantId, input)
		);
	}

	updateClient(session: AuthSession, id: string, input: UpdateClientInput): Promise<Client> {
		return this.db.withTenant(session, async (trx) => {
			const client =
				Object.keys(input).length === 0
					? await this.store.client(trx, id)
					: await this.store.updateClient(trx, id, input);
			return found(client, 'Client');
		});
	}

	archiveClient(session: AuthSession, id: string): Promise<Client> {
		return this.db.withTenant(session, async (trx) => {
			if (await this.store.hasOpenDraft(trx, id)) {
				throw new ConflictException({
					code: 'INVALID_STATE',
					message: 'This client still has an open invoice draft',
					details: { field: 'client', message: 'client.openDraft' }
				} satisfies ApiError);
			}
			return found(await this.store.archiveClient(trx, id), 'Client');
		});
	}

	removeClient(session: AuthSession, id: string): Promise<void> {
		return this.db.withTenant(session, async (trx) => {
			found(await this.store.removeClient(trx, id), 'Client');
		});
	}

	projects(
		session: AuthSession,
		filter: { client?: string | undefined; includeArchived: boolean }
	): Promise<Project[]> {
		return this.db.withTenant(session, async (trx) =>
			this.withBudgets(trx, await this.store.projects(trx, filter))
		);
	}

	budgets(session: AuthSession): Promise<Project[]> {
		return this.db.withTenant(session, async (trx) =>
			this.withBudgets(trx, await this.store.budgeted(trx))
		);
	}

	project(session: AuthSession, id: string): Promise<Project> {
		return this.db.withTenant(session, (trx) => this.read(trx, id));
	}

	createProject(session: AuthSession, input: CreateProjectInput): Promise<Project> {
		return this.db.withTenant(session, async (trx) =>
			this.read(trx, await this.store.insertProject(trx, session.tenantId, input))
		);
	}

	updateProject(session: AuthSession, id: string, input: UpdateProjectInput): Promise<Project> {
		return this.db.withTenant(session, async (trx) => {
			if (Object.keys(input).length > 0) await this.store.updateProject(trx, id, input);
			return this.read(trx, id);
		});
	}

	archiveProject(session: AuthSession, id: string): Promise<Project> {
		return this.db.withTenant(session, async (trx) => {
			await this.store.archiveProject(trx, id);
			return this.read(trx, id);
		});
	}

	members(session: AuthSession, id: string): Promise<ProjectMember[]> {
		return this.db.withTenant(session, async (trx) => {
			found(await this.store.project(trx, id), 'Project');
			return this.store.members(trx, id);
		});
	}

	setMembers(
		session: AuthSession,
		id: string,
		employeeIds: readonly string[]
	): Promise<{ employeeIds: string[] }> {
		return this.db.withTenant(session, async (trx) => {
			found(await this.store.lockProject(trx, id), 'Project');
			return { employeeIds: await this.store.setMembers(trx, session.tenantId, id, employeeIds) };
		});
	}

	tasks(session: AuthSession, projectId: string): Promise<Task[]> {
		return this.db.withTenant(session, async (trx) => {
			found(await this.store.project(trx, projectId), 'Project');
			return this.store.tasks(trx, projectId);
		});
	}

	createTask(session: AuthSession, projectId: string, input: CreateTaskInput): Promise<Task> {
		return this.db.withTenant(session, async (trx) => {
			const { clientId } = found(await this.store.lockProject(trx, projectId), 'Project');
			return this.store.insertTask(trx, session.tenantId, { id: projectId, clientId }, input);
		});
	}

	updateTask(session: AuthSession, id: string, input: UpdateTaskInput): Promise<Task> {
		return this.db.withTenant(session, async (trx) => {
			const task =
				Object.keys(input).length === 0
					? await this.store.task(trx, id)
					: await this.store.updateTask(trx, id, input);
			return found(task, 'Task');
		});
	}

	archiveTask(session: AuthSession, id: string): Promise<Task> {
		return this.db.withTenant(session, async (trx) =>
			found(await this.store.archiveTask(trx, id), 'Task')
		);
	}

	bookable(session: AuthSession): Promise<BookableProject[]> {
		employeeOf(session);
		return this.db.withTenant(session, async (trx) =>
			(await this.store.bookable(trx)).map(({ id, name, clientName, billable, tasks }) => ({
				id,
				name,
				clientName,
				billable,
				tasks
			}))
		);
	}

	rates(session: AuthSession, filter: RateFilter): Promise<Rate[]> {
		return this.db.withTenant(session, (trx) => this.store.rates(trx, filter));
	}

	createRate(session: AuthSession, input: CreateRateInput): Promise<Rate> {
		return this.db.withTenant(session, (trx) => this.store.insertRate(trx, session, input));
	}

	// the policy would silently delete nothing, this says why
	removeRate(session: AuthSession, id: string): Promise<void> {
		return this.db.withTenant(session, async (trx) => {
			const { future } = found(await this.store.rateStart(trx, id), 'Rate');
			if (!future) {
				throw new ConflictException({
					code: 'INVALID_STATE',
					message: 'Only a rate that has not taken effect yet can be removed',
					details: { field: 'validFrom', message: 'rate.futureOnly' }
				} satisfies ApiError);
			}
			await this.store.removeRate(trx, id);
		});
	}

	private async read(trx: Trx, id: string): Promise<Project> {
		const row = found(await this.store.project(trx, id), 'Project');
		const [project] = await this.withBudgets(trx, [row]);
		return project!;
	}

	private async withBudgets(trx: Trx, rows: ProjectRow[]): Promise<Project[]> {
		const budgets = await this.budgetsOf(trx, rows);
		return rows.map((row) => toProject(row, budgets.get(row.id) ?? null));
	}

	private async budgetsOf(trx: Trx, rows: ProjectRow[]): Promise<Map<string, BudgetStatus>> {
		const budgeted = rows.filter((row) => row.budget_minutes !== null);
		const ids = budgeted.map((row) => row.id);
		const [tasks, finished] = await Promise.all([
			this.store.tasksOf(trx, ids),
			this.entries.finished(trx, ids)
		]);
		const projects = new Map(budgeted.map((row) => [row.id, metaOf(row)]));
		const catalog = { projects, tasks };
		const now = this.clock.now();

		const budgets = new Map<string, BudgetStatus>();
		for (const project of projects.values()) {
			const booked = finished.filter((entry) => entry.projectId === project.id);
			const budget = budgetOf(project, booked, catalog, now);
			if (budget) budgets.set(project.id, budget);
		}
		return budgets;
	}
}

function found<T>(row: T | undefined, what: string): T {
	if (row === undefined) throw new NotFoundException(`${what} not found`);
	return row;
}
