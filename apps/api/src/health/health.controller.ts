import { Controller, Get } from '@nestjs/common';
import type { Health } from '@zeit/shared';

@Controller('health')
export class HealthController {
	@Get()
	check(): Health {
		return { status: 'ok' };
	}
}
