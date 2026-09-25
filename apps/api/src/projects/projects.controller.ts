import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Patch,
	Post,
	Put,
	Query
} from '@nestjs/common';
import {
	createClientSchema,
	createProjectSchema,
	createRateSchema,
	createTaskSchema,
	emptyBodySchema,
	updateClientSchema,
	updateProjectSchema,
	updateTaskSchema,
	uuidSchema
} from '@zeit/shared';
import type {
	BookableProject,
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
import { z } from 'zod';
import { CurrentSession } from '../common/current-session.decorator';
import { RequireReauth } from '../common/reauth.guard';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import type { ProjectMember, RateFilter } from './projects.store';
import { ProjectsService } from './projects.service';

const id = new ZodPipe(uuidSchema);
const empty = new ZodPipe(emptyBodySchema);

const archivedQuery = z.object({ includeArchived: z.stringbool().default(false) });
const projectsQuery = archivedQuery.extend({ client: uuidSchema.optional() });
const ratesQuery = z.object({
	client: uuidSchema.optional(),
	project: uuidSchema.optional(),
	employee: uuidSchema.optional()
});
const membersSchema = z.strictObject({ employeeIds: z.array(uuidSchema).max(500) });

@Controller()
@Roles('hr')
export class ProjectsController {
	constructor(private readonly projects: ProjectsService) {}

	@Get('clients')
	clients(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(archivedQuery)) query: z.infer<typeof archivedQuery>
	): Promise<Client[]> {
		return this.projects.clients(session, query.includeArchived);
	}

	@Post('clients')
	createClient(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(createClientSchema)) body: CreateClientInput
	): Promise<Client> {
		return this.projects.createClient(session, body);
	}

	@Get('clients/:id')
	client(
		@CurrentSession() session: AuthSession,
		@Param('id', id) clientId: string
	): Promise<Client> {
		return this.projects.client(session, clientId);
	}

	@Patch('clients/:id')
	updateClient(
		@CurrentSession() session: AuthSession,
		@Param('id', id) clientId: string,
		@Body(new ZodPipe(updateClientSchema)) body: UpdateClientInput
	): Promise<Client> {
		return this.projects.updateClient(session, clientId, body);
	}

	@Post('clients/:id/archive')
	@HttpCode(200)
	archiveClient(
		@CurrentSession() session: AuthSession,
		@Param('id', id) clientId: string,
		@Body(empty) _body: object
	): Promise<Client> {
		return this.projects.archiveClient(session, clientId);
	}

	@Delete('clients/:id')
	@Roles('admin')
	@RequireReauth()
	@HttpCode(204)
	async removeClient(@CurrentSession() session: AuthSession, @Param('id', id) clientId: string) {
		await this.projects.removeClient(session, clientId);
	}

	// ahead of projects/:id, the uuid pipe would answer these two with 400
	@Get('projects/bookable')
	@Roles('employee')
	bookable(@CurrentSession() session: AuthSession): Promise<BookableProject[]> {
		return this.projects.bookable(session);
	}

	@Get('projects/budgets')
	budgets(@CurrentSession() session: AuthSession): Promise<Project[]> {
		return this.projects.budgets(session);
	}

	@Get('projects')
	list(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(projectsQuery)) query: z.infer<typeof projectsQuery>
	): Promise<Project[]> {
		return this.projects.projects(session, query);
	}

	@Post('projects')
	createProject(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(createProjectSchema)) body: CreateProjectInput
	): Promise<Project> {
		return this.projects.createProject(session, body);
	}

	@Get('projects/:id')
	project(
		@CurrentSession() session: AuthSession,
		@Param('id', id) projectId: string
	): Promise<Project> {
		return this.projects.project(session, projectId);
	}

	@Patch('projects/:id')
	updateProject(
		@CurrentSession() session: AuthSession,
		@Param('id', id) projectId: string,
		@Body(new ZodPipe(updateProjectSchema)) body: UpdateProjectInput
	): Promise<Project> {
		return this.projects.updateProject(session, projectId, body);
	}

	@Post('projects/:id/archive')
	@HttpCode(200)
	archiveProject(
		@CurrentSession() session: AuthSession,
		@Param('id', id) projectId: string,
		@Body(empty) _body: object
	): Promise<Project> {
		return this.projects.archiveProject(session, projectId);
	}

	@Get('projects/:id/members')
	@Workspace('company')
	members(
		@CurrentSession() session: AuthSession,
		@Param('id', id) projectId: string
	): Promise<ProjectMember[]> {
		return this.projects.members(session, projectId);
	}

	@Put('projects/:id/members')
	@Workspace('company')
	setMembers(
		@CurrentSession() session: AuthSession,
		@Param('id', id) projectId: string,
		@Body(new ZodPipe(membersSchema)) body: z.infer<typeof membersSchema>
	): Promise<{ employeeIds: string[] }> {
		return this.projects.setMembers(session, projectId, body.employeeIds);
	}

	@Get('projects/:id/tasks')
	tasks(
		@CurrentSession() session: AuthSession,
		@Param('id', id) projectId: string
	): Promise<Task[]> {
		return this.projects.tasks(session, projectId);
	}

	@Post('projects/:id/tasks')
	createTask(
		@CurrentSession() session: AuthSession,
		@Param('id', id) projectId: string,
		@Body(new ZodPipe(createTaskSchema)) body: CreateTaskInput
	): Promise<Task> {
		return this.projects.createTask(session, projectId, body);
	}

	@Patch('tasks/:id')
	updateTask(
		@CurrentSession() session: AuthSession,
		@Param('id', id) taskId: string,
		@Body(new ZodPipe(updateTaskSchema)) body: UpdateTaskInput
	): Promise<Task> {
		return this.projects.updateTask(session, taskId, body);
	}

	@Post('tasks/:id/archive')
	@HttpCode(200)
	archiveTask(
		@CurrentSession() session: AuthSession,
		@Param('id', id) taskId: string,
		@Body(empty) _body: object
	): Promise<Task> {
		return this.projects.archiveTask(session, taskId);
	}

	@Get('rates')
	rates(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(ratesQuery)) query: RateFilter
	): Promise<Rate[]> {
		return this.projects.rates(session, query);
	}

	@Post('rates')
	createRate(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(createRateSchema)) body: CreateRateInput
	): Promise<Rate> {
		return this.projects.createRate(session, body);
	}

	@Delete('rates/:id')
	@HttpCode(204)
	async removeRate(@CurrentSession() session: AuthSession, @Param('id', id) rateId: string) {
		await this.projects.removeRate(session, rateId);
	}
}
