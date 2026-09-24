import { Module } from '@nestjs/common';
import { TimeModule } from '../time/time.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { ComplianceStore } from './compliance.store';

@Module({
	imports: [TimeModule],
	controllers: [ComplianceController],
	providers: [ComplianceService, ComplianceStore]
})
export class ComplianceModule {}
