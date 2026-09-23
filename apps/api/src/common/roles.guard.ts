import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	SetMetadata
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasRole, type Role } from '@zeit/shared';
import type { Request } from 'express';

export const ROLE = 'role';
// the lowest role that may pass, everyone above it on the ladder may too
export const Roles = (role: Role) => SetMetadata(ROLE, role);

@Injectable()
export class RolesGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const required = this.reflector.getAllAndOverride<Role | undefined>(ROLE, [
			context.getHandler(),
			context.getClass()
		]);
		if (!required) return true;

		const session = context.switchToHttp().getRequest<Request>().auth;
		if (session && hasRole(session.role, required)) return true;

		throw new ForbiddenException('Not allowed for your role');
	}
}
