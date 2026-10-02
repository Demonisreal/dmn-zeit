import {
	CanActivate,
	ExecutionContext,
	HttpException,
	HttpStatus,
	Injectable
} from '@nestjs/common';
import type { ApiError } from '@zeit/shared';
import type { Response } from 'express';
import {
	activeCount,
	MAX_CONCURRENT,
	MAX_QUEUED,
	queueDepth,
	RETRY_AFTER_SECONDS
} from './render-limit';

@Injectable()
export class RenderLimitGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		if (activeCount() < MAX_CONCURRENT || queueDepth() < MAX_QUEUED) return true;

		context.switchToHttp().getResponse<Response>().setHeader('Retry-After', RETRY_AFTER_SECONDS);
		throw new HttpException(
			{
				code: 'RENDER_BUSY',
				message: 'Too many documents are rendering right now, try again shortly',
				details: null
			} satisfies ApiError,
			HttpStatus.SERVICE_UNAVAILABLE
		);
	}
}
