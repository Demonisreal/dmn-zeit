import {
	CanActivate,
	ExecutionContext,
	Injectable,
	NotFoundException,
	SetMetadata
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { WorkspaceKind } from '@zeit/shared';
import type { Request } from 'express';

export const WORKSPACE = 'workspace';
export const Workspace = (kind: WorkspaceKind) => SetMetadata(WORKSPACE, kind);

@Injectable()
export class WorkspaceGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const required = this.reflector.getAllAndOverride<WorkspaceKind | undefined>(WORKSPACE, [
			context.getHandler(),
			context.getClass()
		]);
		if (!required) return true;

		const request = context.switchToHttp().getRequest<Request>();
		if (request.auth?.workspace === required) return true;

		// same answer as a route that does not exist, a solo workspace learns nothing about the rest
		throw new NotFoundException(`Cannot ${request.method} ${request.originalUrl}`);
	}
}
