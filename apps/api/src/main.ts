import { ConfigService } from '@nestjs/config';
import { createApp } from './app';
import type { Config } from './config';

async function bootstrap() {
	const app = await createApp();
	// closes the pool on SIGTERM, docker stop would otherwise cut open transactions
	app.enableShutdownHooks();

	await app.listen(
		app.get<ConfigService<Config, true>>(ConfigService).get('PORT', { infer: true })
	);
}

void bootstrap();
