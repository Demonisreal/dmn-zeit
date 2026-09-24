import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { holidaysQuerySchema, updateTenantSchema } from '@zeit/shared';
import type { Holiday, HolidaysQuery, Tenant, UpdateTenantInput } from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { TenantService } from './tenant.service';

@Roles('employee')
@Controller()
export class TenantController {
	constructor(private readonly tenant: TenantService) {}

	@Get('tenant')
	get(@CurrentSession() session: AuthSession): Promise<Tenant> {
		return this.tenant.get(session);
	}

	@Patch('tenant')
	@Roles('admin')
	update(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(updateTenantSchema)) body: UpdateTenantInput
	): Promise<Tenant> {
		return this.tenant.update(session, body);
	}

	@Get('holidays')
	holidays(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(holidaysQuerySchema)) query: HolidaysQuery
	): Promise<Holiday[]> {
		return this.tenant.holidays(session, query.year);
	}
}
