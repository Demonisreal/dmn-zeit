import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingStore } from './billing.store';

@Module({
	imports: [MailModule],
	controllers: [BillingController],
	providers: [BillingStore, BillingService],
	exports: [BillingStore]
})
export class BillingModule {}
