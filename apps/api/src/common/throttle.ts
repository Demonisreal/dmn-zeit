import { isIPv4 } from 'node:net';
import { ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
	hours,
	minutes,
	normalizeIp,
	ThrottlerGuard,
	type ThrottlerLimitDetail,
	type ThrottlerModuleOptions
} from '@nestjs/throttler';
import type { Response } from 'express';

const PER_EMAIL = 'throttlePerEmail';
export const ThrottlePerEmail = () => SetMetadata(PER_EMAIL, true);

const PER_NETWORK = 'throttlePerNetwork';
export const ThrottlePerNetwork = () => SetMetadata(PER_NETWORK, true);

export function networkOf(ip: string): string {
	const address = normalizeIp(ip);
	return isIPv4(address) ? address.replace(/\.\d+$/, '.0/24') : address;
}

const reflector = new Reflector();

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
		},
		{
			name: 'network',
			ttl: minutes(15),
			limit: 200,
			getTracker: (request) => networkOf(request.ip),
			skipIf: (context) =>
				!reflector.getAllAndOverride<boolean | undefined>(PER_NETWORK, [
					context.getHandler(),
					context.getClass()
				])
		}
	]
};

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
	protected override throwThrottlingException(
		context: ExecutionContext,
		detail: ThrottlerLimitDetail
	): Promise<void> {
		context
			.switchToHttp()
			.getResponse<Response>()
			.header('Retry-After', String(detail.timeToBlockExpire));
		return super.throwThrottlingException(context, detail);
	}
}
