import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CleanupJob } from './cleanup.job';

@Module({
	imports: [ScheduleModule.forRoot()],
	providers: [CleanupJob]
})
export class JobsModule {}
