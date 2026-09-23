import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { Roles, RolesGuard } from './roles.guard';

@Roles('hr')
class Staff {
	list() {}

	@Roles('admin')
	reopen() {}
}

class Open {
	clock() {}
}

const guard = new RolesGuard(new Reflector());

function allowed(role: Role | null, handler: () => void, controller: object) {
	const context = {
		getHandler: () => handler,
		getClass: () => controller,
		switchToHttp: () => ({ getRequest: () => ({ auth: role ? { role } : undefined }) })
	} as unknown as ExecutionContext;
	try {
		return guard.canActivate(context);
	} catch (error) {
		if (error instanceof ForbiddenException) return false;
		throw error;
	}
}

describe('RolesGuard', () => {
	it('lets the named role and everyone above it through', () => {
		expect(allowed('hr', Staff.prototype.list, Staff)).toBe(true);
		expect(allowed('admin', Staff.prototype.list, Staff)).toBe(true);
		expect(allowed('team_lead', Staff.prototype.list, Staff)).toBe(false);
		expect(allowed('employee', Staff.prototype.list, Staff)).toBe(false);
	});

	it('lets the method narrow what the controller allows', () => {
		expect(allowed('hr', Staff.prototype.reopen, Staff)).toBe(false);
		expect(allowed('admin', Staff.prototype.reopen, Staff)).toBe(true);
	});

	it('stays out of routes without a role', () => {
		expect(allowed('employee', Open.prototype.clock, Open)).toBe(true);
	});

	it('refuses when there is no session to read a role from', () => {
		expect(allowed(null, Staff.prototype.list, Staff)).toBe(false);
	});
});
