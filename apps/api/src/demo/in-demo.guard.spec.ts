import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppMode } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { InDemoGuard } from './in-demo.guard';

const guardIn = (mode: AppMode) => new InDemoGuard(new ConfigService({ APP_MODE: mode }));

describe('InDemoGuard', () => {
	it('lets the demo through', () => {
		expect(guardIn('demo').canActivate()).toBe(true);
	});

	it.each(['live', 'test'] as const)('answers 404 in %s mode', (mode) => {
		expect(() => guardIn(mode).canActivate()).toThrow(NotFoundException);
	});
});
