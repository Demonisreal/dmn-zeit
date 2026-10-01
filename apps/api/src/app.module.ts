import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AbsencesModule } from './absences/absences.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CommonModule } from './common/common.module';
import { CsrfGuard } from './common/csrf.guard';
import { EnrollmentGuard } from './common/enrollment.guard';
import { ApiExceptionFilter } from './common/exception.filter';
import { loggerParams } from './common/logging';
import { ReauthGuard } from './common/reauth.guard';
import { RolesGuard } from './common/roles.guard';
import { SessionGuard } from './common/session.guard';
import { AppThrottlerGuard, throttlerOptions } from './common/throttle';
import { WorkspaceGuard } from './common/workspace.guard';
import { ComplianceModule } from './compliance/compliance.module';
import { loadConfig, type Config } from './config';
import { CorrectionsModule } from './corrections/corrections.module';
import { DbModule } from './db/db.module';
import { DemoModule } from './demo/demo.module';
import { ExportsModule } from './exports/exports.module';
import { FlexModule } from './flex/flex.module';
import { HealthModule } from './health/health.module';
import { InvoicesModule } from './invoices/invoices.module';
import { JobsModule } from './jobs/jobs.module';
import { MailModule } from './mail/mail.module';
import { MonthsModule } from './months/months.module';
import { OrgModule } from './org/org.module';
import { ProjectsModule } from './projects/projects.module';
import { TenantModule } from './tenant/tenant.module';
import { TimeModule } from './time/time.module';
import { UsersModule } from './users/users.module';
import { VacationModule } from './vacation/vacation.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: join(__dirname, '..', '..', '..', '.env'),
			validate: loadConfig
		}),
		LoggerModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService<Config, true>) =>
				loggerParams(config.get('APP_MODE', { infer: true }))
		}),
		ThrottlerModule.forRoot(throttlerOptions),
		CommonModule,
		DbModule,
		HealthModule,
		AuthModule,
		OrgModule,
		TenantModule,
		UsersModule,
		TimeModule,
		ProjectsModule,
		BillingModule,
		InvoicesModule,
		CorrectionsModule,
		AbsencesModule,
		VacationModule,
		FlexModule,
		ComplianceModule,
		MonthsModule,
		ExportsModule,
		AuditModule,
		ConditionalModule.registerWhen(DemoModule, (env) => env.APP_MODE === 'demo'),
		MailModule,
		JobsModule
	],
	providers: [
		{ provide: APP_FILTER, useClass: ApiExceptionFilter },
		{ provide: APP_GUARD, useClass: AppThrottlerGuard },
		{ provide: APP_GUARD, useClass: SessionGuard },
		{ provide: APP_GUARD, useClass: CsrfGuard },
		{ provide: APP_GUARD, useClass: EnrollmentGuard },
		{ provide: APP_GUARD, useClass: WorkspaceGuard },
		{ provide: APP_GUARD, useClass: RolesGuard },
		{ provide: APP_GUARD, useClass: ReauthGuard }
	]
})
export class AppModule {}
