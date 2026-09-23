import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthSession } from './session.guard';

export const CurrentSession = createParamDecorator((_data: unknown, context: ExecutionContext) => {
	return context.switchToHttp().getRequest<Request>().auth as AuthSession;
});
