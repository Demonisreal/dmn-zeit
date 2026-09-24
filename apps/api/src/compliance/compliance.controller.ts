import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ackFindingSchema, findingsQuerySchema } from '@zeit/shared';
import type { AckFindingInput, Finding, FindingsQuery, RuleSetInfo } from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { ComplianceService } from './compliance.service';

@Controller('compliance')
export class ComplianceController {
	constructor(private readonly compliance: ComplianceService) {}

	@Get('findings')
	@Roles('team_lead')
	findings(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(findingsQuerySchema)) query: FindingsQuery
	): Promise<Finding[]> {
		return this.compliance.findings(session, query);
	}

	@Post('findings/ack')
	@Roles('team_lead')
	ack(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(ackFindingSchema)) body: AckFindingInput
	): Promise<Finding> {
		return this.compliance.ack(session, body);
	}

	@Get('rule-versions')
	@Roles('employee')
	ruleVersions(): RuleSetInfo[] {
		return this.compliance.ruleVersions();
	}
}
