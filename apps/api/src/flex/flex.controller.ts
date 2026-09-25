import { Body, Controller, Param, Post } from '@nestjs/common';
import { createFlexBookingSchema, uuidSchema } from '@zeit/shared';
import type { CreateFlexBookingInput, FlexBooking } from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import { FlexService } from './flex.service';

// a sub path of employees/:id/flex, which time/ answers with the balance
@Controller('employees/:id/flex/bookings')
@Workspace('company')
export class FlexController {
	constructor(private readonly flex: FlexService) {}

	@Post()
	@Roles('hr')
	book(
		@CurrentSession() session: AuthSession,
		@Param('id', new ZodPipe(uuidSchema)) employeeId: string,
		@Body(new ZodPipe(createFlexBookingSchema)) body: CreateFlexBookingInput
	): Promise<FlexBooking> {
		return this.flex.book(session, employeeId, body);
	}
}
