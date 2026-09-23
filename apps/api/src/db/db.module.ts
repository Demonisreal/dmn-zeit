import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Config } from '../config';
import { Database } from './database';

@Global()
@Module({
	providers: [
		{
			provide: Database,
			inject: [ConfigService],
			useFactory: (config: ConfigService<Config, true>) =>
				new Database(config.get('DATABASE_URL', { infer: true }))
		}
	],
	exports: [Database]
})
export class DbModule {}
