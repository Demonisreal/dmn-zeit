import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export type Client = {
	requestId: string;
	ip: string | null;
	userAgent: string | null;
};

export const CurrentClient = createParamDecorator(
	(_data: unknown, context: ExecutionContext): Client => {
		const request = context.switchToHttp().getRequest<Request>();
		return {
			requestId: String(request.id),
			ip: request.ip ?? null,
			userAgent: request.headers['user-agent']?.slice(0, 500) ?? null
		};
	}
);
