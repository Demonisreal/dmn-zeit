import { Module } from '@nestjs/common';
import { TimeModule } from '../time/time.module';
import { ProjectEntriesController } from './project-entries.controller';
import { ProjectEntriesService } from './project-entries.service';
import { ProjectEntriesStore } from './project-entries.store';
import { ProjectTimerController } from './project-timer.controller';
import { ProjectTimerService } from './project-timer.service';
import { ProjectWeekController } from './project-week.controller';
import { ProjectWeekService } from './project-week.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectsStore } from './projects.store';

@Module({
	imports: [TimeModule],
	controllers: [
		ProjectsController,
		ProjectTimerController,
		ProjectEntriesController,
		ProjectWeekController
	],
	providers: [
		ProjectsStore,
		ProjectEntriesStore,
		ProjectsService,
		ProjectTimerService,
		ProjectEntriesService,
		ProjectWeekService
	]
})
export class ProjectsModule {}
