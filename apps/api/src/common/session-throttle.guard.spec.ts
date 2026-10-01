import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';
import type { Clock } from './clock';
import { SessionThrottleGuard } from './session-throttle.guard';

function setup() {
	let now = new Date('2026-09-25T08:00:00Z');
	const headers = new Map<string, string>();
	const guard = new SessionThrottleGuard({ now: () => now } as Clock);
	const call = (sessionId: string) =>
		guard.canActivate({
			switchToHttp: () => ({
				getRequest: () => ({ auth: { id: sessionId } }),
				getResponse: () => ({ header: (name: string, value: string) => headers.set(name, value) })
			})
		} as unknown as ExecutionContext);
	const later = (ms: number) => {
		now = new Date(now.getTime() + ms);
	};
	return { call, later, headers };
}

describe('SessionThrottleGuard', () => {
	it('allows thirty calls a minute per session, then answers 429 with Retry-After', () => {
		const { call, later, headers } = setup();
		for (let i = 0; i < 30; i++) expect(call('s1')).toBe(true);
		later(20_000);

		expect(() => call('s1')).toThrow(ThrottlerException);
		expect(headers.get('Retry-After')).toBe('40');
		expect(call('s2')).toBe(true);
	});

	it('starts over once the minute is up', () => {
		const { call, later } = setup();
		for (let i = 0; i < 30; i++) call('s1');
		later(60_000);
		expect(call('s1')).toBe(true);
	});
});
