import { Injectable } from '@nestjs/common';
import type {
	BookableProject,
	Client,
	CreateClientInput,
	CreateProjectInput,
	CreateRateInput,
	CreateTaskInput,
	Locale,
	Project,
	Rate,
	Task,
	UpdateClientInput,
	UpdateProjectInput,
	UpdateTaskInput
} from '@zeit/shared';
import { sql, type Selectable } from 'kysely';
import type { TenantContext, Trx } from '../db/database';
import type { AppClients, AppRates, AppRoundingMode, AppTasks } from '../db/schema.generated';
import type { Catalog, ProjectMeta, TaskMeta } from './project-engine';

type Increment = Client['roundingIncrementMin'];

export type BookableRow = BookableProject & { rounding: ProjectMeta['project'] };

export type ProjectMember = { employeeId: string; name: string };

export type RateFilter = {
	client?: string | undefined;
	project?: string | undefined;
	employee?: string | undefined;
};

function toClient(row: Selectable<AppClients>): Client {
	return {
		id: row.id,
		number: row.number,
		name: row.name,
		street: row.street,
		postalCode: row.postal_code,
		city: row.city,
		countryCode: row.country_code,
		isBusiness: row.is_business,
		vatId: row.vat_id,
		email: row.email,
		buyerReference: row.buyer_reference,
		invoiceLocale: row.invoice_locale as Locale,
		paymentTermsDays: row.payment_terms_days,
		roundingIncrementMin: row.rounding_increment_min as Increment,
		roundingMode: row.rounding_mode,
		archivedAt: row.archived_at,
		restrictedAt: row.restricted_at
	};
}

function clientColumns(input: UpdateClientInput) {
	return {
		number: input.number,
		name: input.name,
		street: input.street,
		postal_code: input.postalCode,
		city: input.city,
		country_code: input.countryCode,
		is_business: input.isBusiness,
		vat_id: input.vatId,
		email: input.email,
		buyer_reference: input.buyerReference,
		invoice_locale: input.invoiceLocale,
		payment_terms_days: input.paymentTermsDays,
		rounding_increment_min: input.roundingIncrementMin,
		rounding_mode: input.roundingMode
	};
}

function projectColumns(input: UpdateProjectInput) {
	return {
		name: input.name,
		code: input.code,
		billable: input.billable,
		budget_minutes: input.budgetMinutes,
		rounding_increment_min: input.roundingIncrementMin,
		rounding_mode: input.roundingMode,
		open_to_all: input.openToAll
	};
}

function toTask(row: Selectable<AppTasks>): Task {
	return {
		id: row.id,
		projectId: row.project_id,
		name: row.name,
		billable: row.billable,
		archivedAt: row.archived_at
	};
}

function toRate(row: Selectable<AppRates>): Rate {
	return {
		id: row.id,
		clientId: row.client_id,
		projectId: row.project_id,
		taskId: row.task_id,
		employeeId: row.employee_id,
		validFrom: row.valid_from,
		rateCents: row.rate_cents,
		createdBy: row.created_by
	};
}

function selectProjects(trx: Trx) {
	return trx
		.selectFrom('app.projects as p')
		.innerJoin('app.clients as c', 'c.id', 'p.client_id')
		.selectAll('p')
		.select([
			'c.name as client_name',
			'c.rounding_increment_min as client_increment',
			'c.rounding_mode as client_mode'
		]);
}

export type ProjectRow = Awaited<
	ReturnType<ReturnType<typeof selectProjects>['executeTakeFirstOrThrow']>
>;

export function metaOf(row: ProjectRow): ProjectMeta {
	return {
		id: row.id,
		name: row.name,
		clientId: row.client_id,
		clientName: row.client_name,
		billable: row.billable,
		budgetMinutes: row.budget_minutes,
		client: { incrementMinutes: row.client_increment, mode: row.client_mode },
		project: { incrementMinutes: row.rounding_increment_min, mode: row.rounding_mode }
	};
}

export function toProject(row: ProjectRow, budget: Project['budget']): Project {
	return {
		id: row.id,
		clientId: row.client_id,
		name: row.name,
		code: row.code,
		billable: row.billable,
		budget,
		roundingIncrementMin: row.rounding_increment_min as Increment,
		roundingMode: row.rounding_mode,
		openToAll: row.open_to_all,
		archivedAt: row.archived_at
	};
}

@Injectable()
export class ProjectsStore {
	async clients(trx: Trx, includeArchived: boolean): Promise<Client[]> {
		const rows = await trx
			.selectFrom('app.clients')
			.selectAll()
			.$if(!includeArchived, (qb) => qb.where('archived_at', 'is', null))
			.orderBy('name')
			.execute();
		return rows.map(toClient);
	}

	async client(trx: Trx, id: string): Promise<Client | undefined> {
		const row = await trx
			.selectFrom('app.clients')
			.selectAll()
			.where('id', '=', id)
			.executeTakeFirst();
		return row && toClient(row);
	}

	async insertClient(trx: Trx, tenantId: string, input: CreateClientInput): Promise<Client> {
		const row = await trx
			.insertInto('app.clients')
			.values({ tenant_id: tenantId, ...clientColumns(input), name: input.name })
			.returningAll()
			.executeTakeFirstOrThrow();
		return toClient(row);
	}

	async updateClient(trx: Trx, id: string, input: UpdateClientInput): Promise<Client | undefined> {
		const row = await trx
			.updateTable('app.clients')
			.set(clientColumns(input))
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirst();
		return row && toClient(row);
	}

	async hasOpenDraft(trx: Trx, id: string): Promise<boolean> {
		const row = await trx
			.selectFrom('app.invoices')
			.select('id')
			.where('client_id', '=', id)
			.where('status', '=', 'draft')
			.executeTakeFirst();
		return row !== undefined;
	}

	async archiveClient(trx: Trx, id: string): Promise<Client | undefined> {
		const row = await trx
			.updateTable('app.clients')
			.set({ archived_at: sql<string>`coalesce(archived_at, now())` })
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirst();
		return row && toClient(row);
	}

	async removeClient(trx: Trx, id: string): Promise<'deleted' | 'restricted' | undefined> {
		const { numDeletedRows } = await trx
			.deleteFrom('app.clients as c')
			.where('c.id', '=', id)
			.where(({ exists, not, selectFrom }) =>
				not(
					exists(
						selectFrom('app.projects as p').select('p.id').whereRef('p.client_id', '=', 'c.id')
					)
				)
			)
			.where(({ exists, not, selectFrom }) =>
				not(
					exists(selectFrom('app.rates as r').select('r.id').whereRef('r.client_id', '=', 'c.id'))
				)
			)
			.executeTakeFirst();
		if (numDeletedRows > 0n) return 'deleted';

		const restricted = await trx
			.updateTable('app.clients')
			.set({
				archived_at: sql<string>`coalesce(archived_at, now())`,
				restricted_at: sql<string>`coalesce(restricted_at, now())`
			})
			.where('id', '=', id)
			.executeTakeFirst();
		if (restricted.numUpdatedRows === 0n) return undefined;

		await trx
			.updateTable('app.projects')
			.set({ archived_at: sql<string>`coalesce(archived_at, now())` })
			.where('client_id', '=', id)
			.execute();
		return 'restricted';
	}

	projects(
		trx: Trx,
		filter: { client?: string | undefined; includeArchived: boolean }
	): Promise<ProjectRow[]> {
		return selectProjects(trx)
			.$if(filter.client !== undefined, (qb) => qb.where('p.client_id', '=', filter.client!))
			.$if(!filter.includeArchived, (qb) => qb.where('p.archived_at', 'is', null))
			.orderBy('c.name')
			.orderBy('p.name')
			.execute();
	}

	budgeted(trx: Trx): Promise<ProjectRow[]> {
		return selectProjects(trx)
			.where('p.archived_at', 'is', null)
			.where('p.budget_minutes', 'is not', null)
			.orderBy('c.name')
			.orderBy('p.name')
			.execute();
	}

	project(trx: Trx, id: string): Promise<ProjectRow | undefined> {
		return selectProjects(trx).where('p.id', '=', id).executeTakeFirst();
	}

	async insertProject(trx: Trx, tenantId: string, input: CreateProjectInput): Promise<string> {
		const { id } = await trx
			.insertInto('app.projects')
			.values({
				tenant_id: tenantId,
				client_id: input.clientId,
				...projectColumns(input),
				name: input.name
			})
			.returning('id')
			.executeTakeFirstOrThrow();
		return id;
	}

	async updateProject(trx: Trx, id: string, input: UpdateProjectInput): Promise<void> {
		await trx.updateTable('app.projects').set(projectColumns(input)).where('id', '=', id).execute();
	}

	async archiveProject(trx: Trx, id: string): Promise<void> {
		await trx
			.updateTable('app.projects')
			.set({ archived_at: sql<string>`coalesce(archived_at, now())` })
			.where('id', '=', id)
			.execute();
	}

	lockProject(trx: Trx, id: string): Promise<{ clientId: string } | undefined> {
		return trx
			.selectFrom('app.projects')
			.select('client_id as clientId')
			.where('id', '=', id)
			.forUpdate()
			.executeTakeFirst();
	}

	members(trx: Trx, projectId: string): Promise<ProjectMember[]> {
		return trx
			.selectFrom('app.project_members as m')
			.innerJoin('app.employees as e', 'e.id', 'm.employee_id')
			.select(['e.id as employeeId', sql<string>`e.first_name || ' ' || e.last_name`.as('name')])
			.where('m.project_id', '=', projectId)
			.orderBy('e.last_name')
			.orderBy('e.first_name')
			.execute();
	}

	async setMembers(
		trx: Trx,
		tenantId: string,
		projectId: string,
		employeeIds: readonly string[]
	): Promise<string[]> {
		await trx.deleteFrom('app.project_members').where('project_id', '=', projectId).execute();
		if (employeeIds.length === 0) return [];
		const rows = await trx
			.insertInto('app.project_members')
			.values(
				[...new Set(employeeIds)].map((employeeId) => ({
					tenant_id: tenantId,
					project_id: projectId,
					employee_id: employeeId
				}))
			)
			.returning('employee_id')
			.execute();
		return rows.map((row) => row.employee_id).sort();
	}

	async insertTask(
		trx: Trx,
		tenantId: string,
		project: { id: string; clientId: string },
		input: CreateTaskInput
	): Promise<Task> {
		const row = await trx
			.insertInto('app.tasks')
			.values({
				tenant_id: tenantId,
				client_id: project.clientId,
				project_id: project.id,
				name: input.name,
				billable: input.billable
			})
			.returningAll()
			.executeTakeFirstOrThrow();
		return toTask(row);
	}

	async tasks(trx: Trx, projectId: string): Promise<Task[]> {
		const rows = await trx
			.selectFrom('app.tasks')
			.selectAll()
			.where('project_id', '=', projectId)
			.orderBy('name')
			.execute();
		return rows.map(toTask);
	}

	async task(trx: Trx, id: string): Promise<Task | undefined> {
		const row = await trx
			.selectFrom('app.tasks')
			.selectAll()
			.where('id', '=', id)
			.executeTakeFirst();
		return row && toTask(row);
	}

	async updateTask(trx: Trx, id: string, input: UpdateTaskInput): Promise<Task | undefined> {
		const row = await trx
			.updateTable('app.tasks')
			.set({ name: input.name, billable: input.billable })
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirst();
		return row && toTask(row);
	}

	async archiveTask(trx: Trx, id: string): Promise<Task | undefined> {
		const row = await trx
			.updateTable('app.tasks')
			.set({ archived_at: sql<string>`coalesce(archived_at, now())` })
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirst();
		return row && toTask(row);
	}

	async tasksOf(trx: Trx, projectIds: readonly string[]): Promise<Map<string, TaskMeta>> {
		if (projectIds.length === 0) return new Map();
		const rows = await trx
			.selectFrom('app.tasks')
			.select(['id', 'project_id as projectId', 'name', 'billable'])
			.where('project_id', 'in', projectIds)
			.execute();
		return new Map(rows.map((row) => [row.id, row]));
	}

	async catalog(trx: Trx, projectIds: readonly string[]): Promise<Catalog> {
		if (projectIds.length === 0) return { projects: new Map(), tasks: new Map() };
		const ids = [...new Set(projectIds)];
		const rows = await selectProjects(trx).where('p.id', 'in', ids).execute();
		return {
			projects: new Map(rows.map((row) => [row.id, metaOf(row)])),
			tasks: await this.tasksOf(trx, ids)
		};
	}

	async labels(
		trx: Trx,
		projectIds: readonly string[]
	): Promise<Map<string, { name: string; clientName: string }>> {
		if (projectIds.length === 0) return new Map();
		const { rows } = await sql<{ id: string; project_name: string; client_name: string }>`
			select id, project_name, client_name
			  from app.project_labels(${[...new Set(projectIds)]}::uuid[])`.execute(trx);
		return new Map(
			rows.map((row) => [row.id, { name: row.project_name, clientName: row.client_name }])
		);
	}

	async bookable(trx: Trx): Promise<BookableRow[]> {
		const { rows } = await sql<{
			id: string;
			project_name: string;
			client_name: string;
			billable: boolean;
			rounding_increment_min: number | null;
			rounding_mode: AppRoundingMode | null;
			tasks: { id: string; name: string; billable: boolean | null }[];
		}>`select id, project_name, client_name, billable, rounding_increment_min, rounding_mode, tasks
		     from app.bookable_projects()`.execute(trx);
		return rows.map((row) => ({
			id: row.id,
			name: row.project_name,
			clientName: row.client_name,
			billable: row.billable,
			tasks: row.tasks,
			rounding: { incrementMinutes: row.rounding_increment_min, mode: row.rounding_mode }
		}));
	}

	async budgetStatus(
		trx: Trx,
		projectId: string
	): Promise<{ budgetMinutes: number | null; usedMinutes: number } | undefined> {
		const { rows } = await sql<{ budget_minutes: number | null; used_minutes: number }>`
			select budget_minutes, used_minutes
			  from app.project_budget_status(${projectId}::uuid)`.execute(trx);
		const [row] = rows;
		return row && { budgetMinutes: row.budget_minutes, usedMinutes: row.used_minutes };
	}

	async rates(trx: Trx, filter: RateFilter): Promise<Rate[]> {
		const rows = await trx
			.selectFrom('app.rates')
			.selectAll()
			.$if(filter.client !== undefined, (qb) => qb.where('client_id', '=', filter.client!))
			.$if(filter.project !== undefined, (qb) => qb.where('project_id', '=', filter.project!))
			.$if(filter.employee !== undefined, (qb) => qb.where('employee_id', '=', filter.employee!))
			.orderBy('valid_from', 'desc')
			.orderBy('created_at', 'desc')
			.execute();
		return rows.map(toRate);
	}

	async ratesFor(trx: Trx, clientIds: readonly string[]): Promise<Rate[]> {
		const rows = await trx
			.selectFrom('app.rates')
			.selectAll()
			.where((eb) =>
				clientIds.length === 0
					? eb('client_id', 'is', null)
					: eb.or([eb('client_id', 'is', null), eb('client_id', 'in', clientIds)])
			)
			.execute();
		return rows.map(toRate);
	}

	async insertRate(trx: Trx, ctx: TenantContext, input: CreateRateInput): Promise<Rate> {
		const row = await trx
			.insertInto('app.rates')
			.values({
				tenant_id: ctx.tenantId,
				client_id: input.clientId,
				project_id: input.projectId,
				task_id: input.taskId,
				employee_id: input.employeeId,
				valid_from: input.validFrom,
				rate_cents: input.rateCents,
				created_by: ctx.userId
			})
			.returningAll()
			.executeTakeFirstOrThrow();
		return toRate(row);
	}

	rateStart(trx: Trx, id: string): Promise<{ future: boolean } | undefined> {
		return trx
			.selectFrom('app.rates')
			.select(sql<boolean>`valid_from > (now() at time zone 'Europe/Berlin')::date`.as('future'))
			.where('id', '=', id)
			.executeTakeFirst();
	}

	async removeRate(trx: Trx, id: string): Promise<void> {
		await trx.deleteFrom('app.rates').where('id', '=', id).execute();
	}
}
