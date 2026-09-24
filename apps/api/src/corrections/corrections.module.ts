import { Module } from '@nestjs/common';
import { CorrectionsController } from './corrections.controller';
import { CorrectionsService } from './corrections.service';
import { CorrectionsStore } from './corrections.store';

@Module({
	controllers: [CorrectionsController],
	providers: [CorrectionsService, CorrectionsStore]
})
export class CorrectionsModule {}
