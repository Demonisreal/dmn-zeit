import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
	createProjectEntrySchema,
	emptyBodySchema,
	entriesQuerySchema,
	reasonSchema,
	updateProjectEntrySchema,
	uuidSchema
} from '@zeit/shared';
import type { EntriesQuery, ProjectEntry, UpdateProjectEntryInput } from '@zeit/shared';
import { CurrentClient, type Client } from '../common/client.decorator';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { ProjectEntriesService, type ProjectEntryPage } from './project-entries.service';

const id = new ZodPipe(uuidSchema);

const createProjectEntryForOthersSchema = createProjectEntrySchema.extend({
	employeeId: uuidSchema,
	reason: reasonSchema
});

const own = new ZodPipe(createProjectEntrySchema);
const forOthers = new ZodPipe(createProjectEntryForOthersSchema);

@Controller()
@Roles('employee')
export class ProjectEntriesController {
	constructor(private readonly entries: ProjectEntriesService) {}

	@Get('employees/:id/project-entries')
	page(
		@CurrentSession() session: AuthSession,
		@Param('id', id) employeeId: string,
		@Query(new ZodPipe(entriesQuerySchema)) query: EntriesQuery
	): Promise<ProjectEntryPage> {
		return this.entries.page(session, employeeId, query);
	}

	@Post('project-entries')
	create(
		@CurrentSession() session: AuthSession,
		@Body() body: unknown,
		@CurrentClient() client: Client
	): Promise<ProjectEntry> {
		if (typeof body === 'object' && body !== null && 'employeeId' in body) {
			const { employeeId, reason, ...entry } = forOthers.transform(body, { type: 'body' });
			return this.entries.create(session, entry, { employeeId, reason }, client);
		}
		return this.entries.create(session, own.transform(body, { type: 'body' }), null, client);
	}

	@Patch('project-entries/:id')
	update(
		@CurrentSession() session: AuthSession,
		@Param('id', id) entryId: string,
		@Body(new ZodPipe(updateProjectEntrySchema)) body: UpdateProjectEntryInput
	): Promise<ProjectEntry> {
		return this.entries.update(session, entryId, body);
	}

	@Post('project-entries/:id/void')
	@HttpCode(200)
	voidEntry(
		@CurrentSession() session: AuthSession,
		@Param('id', id) entryId: string,
		@Body(new ZodPipe(emptyBodySchema)) _body: object
	): Promise<ProjectEntry> {
		return this.entries.voidEntry(session, entryId);
	}
}
