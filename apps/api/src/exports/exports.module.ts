import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { MonthsModule } from '../months/months.module';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { ExportsStore } from './exports.store';

@Module({
	imports: [MonthsModule, DocumentsModule],
	controllers: [ExportsController],
	providers: [ExportsStore, ExportsService]
})
export class ExportsModule {}
