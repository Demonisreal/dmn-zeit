import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AbsencesModule } from './absences/absences.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ComplianceModule } from './compliance/compliance.module';
import { loadConfig } from './config';
import { CorrectionsModule } from './corrections/corrections.module';
import { DemoModule } from './demo/demo.module';
import { ExportsModule } from './exports/exports.module';
import { FlexModule } from './flex/flex.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { MailModule } from './mail/mail.module';
import { MonthsModule } from './months/months.module';
import { OrgModule } from './org/org.module';
import { TenantModule } from './tenant/tenant.module';
import { TimeModule } from './time/time.module';
import { VacationModule } from './vacation/vacation.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			// the .env in the repo root, shared with dbmate; containers get their env from compose
			envFilePath: join(__dirname, '..', '..', '..', '.env'),
			validate: loadConfig
		}),
		HealthModule,
		AuthModule,
		OrgModule,
		TenantModule,
		TimeModule,
		CorrectionsModule,
		AbsencesModule,
		VacationModule,
		FlexModule,
		ComplianceModule,
		MonthsModule,
		ExportsModule,
		AuditModule,
		DemoModule,
		MailModule,
		JobsModule
	]
})
export class AppModule {}
