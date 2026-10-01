import 'reflect-metadata';
import type { Server } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { bodyErrors } from './common/body-errors';
import type { Config } from './config';

export const HEADERS_TIMEOUT = 10_000;
export const REQUEST_TIMEOUT = 30_000;
export const KEEP_ALIVE_TIMEOUT = 130_000;
export const MAX_HEADERS = 100;

export async function createApp(): Promise<NestExpressApplication> {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		bodyParser: false,
		bufferLogs: true
	});
	const config = app.get<ConfigService<Config, true>>(ConfigService);

	const server: Server = app.getHttpServer();
	server.headersTimeout = HEADERS_TIMEOUT;
	server.requestTimeout = REQUEST_TIMEOUT;
	server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT;
	server.maxHeadersCount = MAX_HEADERS;

	app.useLogger(app.get(Logger));
	app.set('trust proxy', config.get('TRUSTED_PROXY', { infer: true }));
	app.use(
		helmet({
			contentSecurityPolicy: {
				useDefaults: false,
				directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] }
			},
			strictTransportSecurity: false,
			xFrameOptions: { action: 'deny' }
		})
	);
	app.use(cookieParser());
	app.useBodyParser('json', { limit: '100kb' });
	app.use(bodyErrors);
	app.setGlobalPrefix('api');

	return app;
}
