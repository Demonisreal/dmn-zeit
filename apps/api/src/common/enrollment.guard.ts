import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	SetMetadata
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiError } from '@zeit/shared';
import type { Request } from 'express';

export const DURING_ENROLLMENT = 'duringEnrollment';
export const AllowDuringEnrollment = () => SetMetadata(DURING_ENROLLMENT, true);

@Injectable()
export class EnrollmentGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const session = context.switchToHttp().getRequest<Request>().auth;
		if (!session?.enrollmentPending) return true;

		const allowed = this.reflector.getAllAndOverride<boolean | undefined>(DURING_ENROLLMENT, [
			context.getHandler(),
			context.getClass()
		]);
		if (allowed) return true;

		throw new ForbiddenException({
			code: 'MFA_ENROLLMENT_REQUIRED',
			message: 'Set up a second factor first',
			details: null
		} satisfies ApiError);
	}
}
