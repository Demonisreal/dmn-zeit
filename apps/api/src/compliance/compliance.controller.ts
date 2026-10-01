import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ackFindingSchema, findingsQuerySchema } from '@zeit/shared';
import type { AckFindingInput, Finding, FindingsQuery, RuleSetInfo } from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import { SessionThrottleGuard } from '../common/session-throttle.guard';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import { ComplianceService } from './compliance.service';

@Controller('compliance')
@Workspace('company')
export class ComplianceController {
	constructor(private readonly compliance: ComplianceService) {}

	@Get('findings')
	@Roles('team_lead')
	@UseGuards(SessionThrottleGuard)
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
