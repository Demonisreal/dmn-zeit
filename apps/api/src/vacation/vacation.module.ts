import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { VacationController } from './vacation.controller';
import { VacationService } from './vacation.service';
import { VacationStore } from './vacation.store';

@Module({
	imports: [MailModule],
	controllers: [VacationController],
	providers: [VacationStore, VacationService],
	exports: [VacationStore]
})
export class VacationModule {}
