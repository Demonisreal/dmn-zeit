import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Config } from './config';

// main.ts and the integration tests have to get the very same middleware stack
export async function createApp(): Promise<NestExpressApplication> {
	// web and api share one origin behind caddy, so there is no cors to configure
	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		bodyParser: false,
		bufferLogs: true
	});
	const config = app.get<ConfigService<Config, true>>(ConfigService);

	app.useLogger(app.get(Logger));
	// only the pinned proxy subnet may set x-forwarded-for, rate limits count per client address
	app.set('trust proxy', config.get('TRUSTED_PROXY', { infer: true }));
	app.use(helmet());
	app.use(cookieParser());
	app.useBodyParser('json', { limit: '100kb' });
	app.setGlobalPrefix('api');

	return app;
}
