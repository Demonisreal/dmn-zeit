import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Config } from '../config';
import { Database } from '../db/database';
import { MailQueue } from './mail.queue';
import { MailTransport } from './mail.transport';
import { MemoryTransport } from './memory.transport';
import { OutboxTransport } from './outbox.transport';
import { ResendTransport } from './resend.transport';

@Module({
	providers: [
		MailQueue,
		{
			provide: MailTransport,
			inject: [ConfigService, Database],
			useFactory: (config: ConfigService<Config, true>, db: Database): MailTransport => {
				switch (config.get('APP_MODE', { infer: true })) {
					case 'live':
						return new ResendTransport(
							config.get('RESEND_API_KEY', { infer: true })!,
							config.get('MAIL_FROM', { infer: true })!
						);
					case 'demo':
						return new OutboxTransport(db);
					case 'test':
						return new MemoryTransport();
				}
			}
		}
	],
	exports: [MailTransport, MailQueue]
})
export class MailModule {}
