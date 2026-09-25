import { Controller, Get, Param, Query } from '@nestjs/common';
import { daysQuerySchema, entriesQuerySchema, flexQuerySchema, uuidSchema } from '@zeit/shared';
import type {
	DayRange,
	DaysQuery,
	EntriesQuery,
	FlexAccount,
	FlexQuery,
	TimeEntryPage
} from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import { TimeService } from './time.service';

// who may see whom is checked per person in the service, the role alone says nothing here
@Controller('employees/:id')
@Roles('employee')
@Workspace('company')
export class TimeController {
	constructor(private readonly time: TimeService) {}

	@Get('entries')
	entries(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) id: string,
		@Query(new ZodPipe(entriesQuerySchema)) query: EntriesQuery
	): Promise<TimeEntryPage> {
		return this.time.entries(session, id, query);
	}

	@Get('days')
	days(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) id: string,
		@Query(new ZodPipe(daysQuerySchema)) query: DaysQuery
	): Promise<DayRange> {
		return this.time.days(session, id, query);
	}

	// only the account, booking goes through the flex module
	@Get('flex')
	flex(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) id: string,
		@Query(new ZodPipe(flexQuerySchema)) query: FlexQuery
	): Promise<FlexAccount> {
		return this.time.flex(session, id, query.year);
	}
}
