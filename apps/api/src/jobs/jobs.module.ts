import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { VacationModule } from '../vacation/vacation.module';
import { CleanupJob } from './cleanup.job';
import { VacationExpiryJob } from './vacation-expiry.job';
import { VacationYearOpeningJob } from './vacation-year-opening.job';

@Module({
	imports: [ScheduleModule.forRoot(), VacationModule],
	providers: [CleanupJob, VacationYearOpeningJob, VacationExpiryJob]
})
export class JobsModule {}
