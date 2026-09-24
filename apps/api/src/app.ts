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

// a client that trickles its headers is dropped after 10 s, a whole request after 30 s
export const HEADERS_TIMEOUT = 10_000;
export const REQUEST_TIMEOUT = 30_000;
// above caddy's upstream keepalive of 2 min, so caddy always closes an idle connection first
export const KEEP_ALIVE_TIMEOUT = 130_000;
// the spa sends about a dozen, node would otherwise parse up to 2000
export const MAX_HEADERS = 100;

// main.ts and the integration tests have to get the very same middleware stack
export async function createApp(): Promise<NestExpressApplication> {
	// web and api share one origin behind caddy, so there is no cors to configure
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
	// only the pinned proxy subnet may set x-forwarded-for, rate limits count per client address
	app.set('trust proxy', config.get('TRUSTED_PROXY', { infer: true }));
	// the api only speaks json, nothing may load or frame it; HSTS is set by caddy
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
