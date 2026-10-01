import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import {
	revenueQuerySchema,
	unbilledQuerySchema,
	updateBillingProfileSchema
} from '@zeit/shared';
import type {
	BillingProfile,
	Revenue,
	RevenueQuery,
	Unbilled,
	UnbilledQuery,
	UpdateBillingProfileInput
} from '@zeit/shared';
import { CurrentClient, type Client } from '../common/client.decorator';
import { CurrentSession } from '../common/current-session.decorator';
import { RequireReauth } from '../common/reauth.guard';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { UserRateLimit, UserRateLimitGuard } from '../invoices/user-rate-limit.guard';
import { BillingService } from './billing.service';

@Controller('billing')
@Roles('hr')
export class BillingController {
	constructor(private readonly billing: BillingService) {}

	@Get('profile')
	profile(@CurrentSession() session: AuthSession): Promise<BillingProfile> {
		return this.billing.profile(session);
	}

	@Patch('profile')
	@Roles('admin')
	@RequireReauth()
	@UseGuards(UserRateLimitGuard)
	@UserRateLimit('billing-profile', 10, 60)
	updateProfile(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(updateBillingProfileSchema)) body: UpdateBillingProfileInput,
		@CurrentClient() client: Client
	): Promise<BillingProfile> {
		return this.billing.updateProfile(session, body, client);
	}

	@Get('unbilled')
	unbilled(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(unbilledQuerySchema)) query: UnbilledQuery
	): Promise<Unbilled> {
		return this.billing.unbilled(session, query);
	}

	@Get('revenue')
	revenue(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(revenueQuerySchema)) query: RevenueQuery
	): Promise<Revenue> {
		return this.billing.revenue(session, query.year);
	}
}
