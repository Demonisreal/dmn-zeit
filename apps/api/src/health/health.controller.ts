import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Health, PublicConfig } from '@zeit/shared';
import { Public } from '../common/session.guard';
import type { Config } from '../config';

@Public()
@Controller()
export class HealthController {
	constructor(private readonly config: ConfigService<Config, true>) {}

	@Get('health')
	check(): Health {
		return { status: 'ok' };
	}

	@Get('config')
	publicConfig(): PublicConfig {
		return { mode: this.config.get('APP_MODE', { infer: true }) };
	}
}
