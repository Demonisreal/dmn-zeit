import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { CorrectionsController } from './corrections.controller';
import { CorrectionsService } from './corrections.service';
import { CorrectionsStore } from './corrections.store';

@Module({
	imports: [MailModule],
	controllers: [CorrectionsController],
	providers: [CorrectionsService, CorrectionsStore]
})
export class CorrectionsModule {}
