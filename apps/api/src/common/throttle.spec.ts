import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';
import { networkOf, ThrottlePerEmail, ThrottlePerNetwork, throttlerOptions } from './throttle';

class Routes {
	@ThrottlePerEmail()
	forgot() {}

	login() {}
}

@ThrottlePerNetwork()
class SecondStep {
	totp() {}
}

const routes = new Routes();
const throttlers = (throttlerOptions as { throttlers: ThrottlerOptions[] }).throttlers;
const email = throttlers.find((throttler) => throttler.name === 'email')!;
const network = throttlers.find((throttler) => throttler.name === 'network')!;

const on = (handler: () => void, owner: object = Routes) =>
	({ getHandler: () => handler, getClass: () => owner }) as unknown as ExecutionContext;

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

describe('network throttler', () => {
	it('counts on routes or controllers that opt in', () => {
		expect(network.skipIf?.(on(routes.login))).toBe(true);
		expect(network.skipIf?.(on(new SecondStep().totp, SecondStep))).toBe(false);
	});

	it('puts a whole /24 or /64 on one counter', () => {
		expect(networkOf('198.51.100.7')).toBe('198.51.100.0/24');
		expect(networkOf('198.51.100.250')).toBe('198.51.100.0/24');
		expect(networkOf('198.51.101.7')).toBe('198.51.101.0/24');
		expect(networkOf('::ffff:198.51.100.7')).toBe('198.51.100.0/24');
		expect(networkOf('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
		expect(networkOf('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
		expect(networkOf('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64');
	});
});
