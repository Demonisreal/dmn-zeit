import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { SessionService } from '../auth/session.service';
import { Public, SessionGuard, type AuthSession } from './session.guard';

class Routes {
	@Public()
	health() {}

	entries() {}
}

const routes = new Routes();

const session: AuthSession = {
	id: 's1',
	userId: 'u1',
	tenantId: 't1',
	role: 'employee',
	employeeId: 'e1',
	csrfHash: Buffer.alloc(32),
	requestId: 'r1'
};

function setup(found: AuthSession | undefined) {
	const resolve = vi.fn(async () => found);
	const guard = new SessionGuard(new Reflector(), { resolve } as unknown as SessionService);
	const request = {} as Request;
	const context = (handler: () => void) =>
		({
			getHandler: () => handler,
			getClass: () => Routes,
			switchToHttp: () => ({ getRequest: () => request })
		}) as unknown as ExecutionContext;
	return { guard, resolve, request, context };
}

describe('SessionGuard', () => {
	it('puts the resolved session on the request', async () => {
		const { guard, request, context } = setup(session);
		expect(await guard.canActivate(context(routes.entries))).toBe(true);
		expect(request.auth).toBe(session);
	});

	it('answers 401 without a valid session', async () => {
		const { guard, context } = setup(undefined);
		await expect(guard.canActivate(context(routes.entries))).rejects.toThrow(UnauthorizedException);
	});

	it('does not even look for a session on public routes', async () => {
		const { guard, resolve, context } = setup(undefined);
		expect(await guard.canActivate(context(routes.health))).toBe(true);
		expect(resolve).not.toHaveBeenCalled();
	});
});
