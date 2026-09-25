import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
	createWorkModelSchema,
	updateWorkModelSchema,
	uuidSchema,
	workModelsQuerySchema
} from '@zeit/shared';
import type {
	CreateWorkModelInput,
	UpdateWorkModelInput,
	WorkModel,
	WorkModelsQuery
} from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import { WorkModelsService } from './work-models.service';

@Roles('hr')
@Controller('work-models')
@Workspace('company')
export class WorkModelsController {
	constructor(private readonly models: WorkModelsService) {}

	@Get()
	list(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(workModelsQuerySchema)) query: WorkModelsQuery
	): Promise<WorkModel[]> {
		return this.models.list(session, query);
	}

	@Post()
	create(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(createWorkModelSchema)) body: CreateWorkModelInput
	): Promise<WorkModel> {
		return this.models.create(session, body);
	}

	@Patch(':id')
	update(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) id: string,
		@Body(new ZodPipe(updateWorkModelSchema)) body: UpdateWorkModelInput
	): Promise<WorkModel> {
		return this.models.update(session, id, body);
	}
}
