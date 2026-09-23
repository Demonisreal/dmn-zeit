import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';
import { ThrottlePerEmail, throttlerOptions } from './throttle';

class Routes {
	@ThrottlePerEmail()
	forgot() {}

	login() {}
}

const routes = new Routes();
const throttlers = (throttlerOptions as { throttlers: ThrottlerOptions[] }).throttlers;
const email = throttlers.find((throttler) => throttler.name === 'email')!;

const on = (handler: () => void) => ({ getHandler: () => handler }) as unknown as ExecutionContext;

describe('email throttler', () => {
	it('only counts on routes that opt in', () => {
		expect(email.skipIf?.(on(routes.forgot))).toBe(false);
		expect(email.skipIf?.(on(routes.login))).toBe(true);
	});

	it('counts one address however it is written', async () => {
		const track = (body: unknown) => email.getTracker?.({ body }, on(routes.forgot));
		expect(await track({ email: ' Anna@Muster.test ' })).toBe(
			await track({ email: 'anna@muster.test' })
		);
		expect(await track({ email: 'bob@muster.test' })).not.toBe(
			await track({ email: 'anna@muster.test' })
		);
	});
});
