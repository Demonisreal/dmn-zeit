import { Controller, Get, Query } from '@nestjs/common';
import { auditQuerySchema } from '@zeit/shared';
import type { AuditPage, AuditQuery } from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { AuditService } from './audit.service';

@Roles('employee')
@Controller('audit')
export class AuditController {
	constructor(private readonly trail: AuditService) {}

	@Get()
	page(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(auditQuerySchema)) query: AuditQuery
	): Promise<AuditPage> {
		return this.trail.page(session, query);
	}
}
