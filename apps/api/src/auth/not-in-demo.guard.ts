import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Config } from '../config';

@Injectable()
export class NotInDemoGuard implements CanActivate {
	private readonly demo: boolean;

	constructor(config: ConfigService<Config, true>) {
		this.demo = config.get('APP_MODE', { infer: true }) === 'demo';
	}

	canActivate(): boolean {
		if (this.demo) throw new NotFoundException('Not available in the demo');
		return true;
	}
}
