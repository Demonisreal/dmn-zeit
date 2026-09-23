import { SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hours, minutes, type ThrottlerModuleOptions } from '@nestjs/throttler';

const PER_EMAIL = 'throttlePerEmail';
// opts a route into the email counter below, every other route skips it
export const ThrottlePerEmail = () => SetMetadata(PER_EMAIL, true);

const reflector = new Reflector();

// memory is enough with one api container, the sandbox limits of the demo go to ops.rate_limits
export const throttlerOptions: ThrottlerModuleOptions = {
	errorMessage: 'Too many requests, try again later',
	throttlers: [
		{ name: 'default', ttl: minutes(1), limit: 300 },
		{
			name: 'email',
			ttl: hours(1),
			limit: 3,
			getTracker: (request) =>
				String(request.body?.email ?? '')
					.trim()
					.toLowerCase(),
			skipIf: (context) => !reflector.get<boolean | undefined>(PER_EMAIL, context.getHandler())
		}
	]
};
