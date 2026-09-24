import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { VacationModule } from '../vacation/vacation.module';
import { AbsencesController } from './absences.controller';
import { AbsencesService } from './absences.service';
import { AbsencesStore } from './absences.store';
import { TeamCalendarController } from './team-calendar.controller';

@Module({
	imports: [MailModule, VacationModule],
	controllers: [AbsencesController, TeamCalendarController],
	providers: [AbsencesStore, AbsencesService]
})
export class AbsencesModule {}
