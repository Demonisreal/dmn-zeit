import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { DocumentsModule } from '../documents/documents.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoicesStore } from './invoices.store';
import { UserRateLimitGuard } from './user-rate-limit.guard';

@Module({
	imports: [BillingModule, DocumentsModule],
	controllers: [InvoicesController],
	providers: [InvoicesStore, InvoicesService, UserRateLimitGuard]
})
export class InvoicesModule {}
