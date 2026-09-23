import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Config } from './config';

async function bootstrap() {
	// web and api share one origin behind caddy, so there is no cors to configure
	const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
	const config = app.get<ConfigService<Config, true>>(ConfigService);

	// only the pinned proxy subnet may set x-forwarded-for, rate limits count per client address
	app.set('trust proxy', config.get('TRUSTED_PROXY', { infer: true }));
	app.use(helmet());
	app.useBodyParser('json', { limit: '100kb' });
	app.setGlobalPrefix('api');

	await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
