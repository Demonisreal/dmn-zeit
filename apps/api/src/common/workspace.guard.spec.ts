import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { WorkspaceKind } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { Workspace, WorkspaceGuard } from './workspace.guard';

@Workspace('company')
class Clock {
	stamp() {}
}

class Users {
	list() {}

	@Workspace('company')
	invite() {}
}

const guard = new WorkspaceGuard(new Reflector());

function reach(workspace: WorkspaceKind | null, handler: () => void, controller: object) {
	const request = {
		method: 'POST',
		originalUrl: '/clock/in',
		auth: workspace ? { workspace } : undefined
	};
	const context = {
		getHandler: () => handler,
		getClass: () => controller,
		switchToHttp: () => ({ getRequest: () => request })
	} as unknown as ExecutionContext;
	return guard.canActivate(context);
}

describe('WorkspaceGuard', () => {
	it('lets a company through to company routes', () => {
		expect(reach('company', Clock.prototype.stamp, Clock)).toBe(true);
		expect(reach('company', Users.prototype.invite, Users)).toBe(true);
	});

	it('answers a solo workspace like a route that does not exist', () => {
		expect(() => reach('solo', Clock.prototype.stamp, Clock)).toThrow(
			new NotFoundException('Cannot POST /clock/in')
		);
		expect(() => reach('solo', Users.prototype.invite, Users)).toThrow(NotFoundException);
	});

	it('stays out of routes open to both', () => {
		expect(reach('solo', Users.prototype.list, Users)).toBe(true);
		expect(reach(null, Users.prototype.list, Users)).toBe(true);
	});
});
