import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { ReauthGuard, RequireReauth } from './reauth.guard';

class Routes {
	@RequireReauth()
	removeTotp() {}

	@RequireReauth({ exceptFirstFactor: true })
	addPasskey() {}

	overview() {}
}

const routes = new Routes();

function outcome(handler: () => void, auth: object, mode = 'live') {
	const guard = new ReauthGuard(new Reflector(), new ConfigService({ APP_MODE: mode }));
	const context = {
		getHandler: () => handler,
		getClass: () => Routes,
		switchToHttp: () => ({ getRequest: () => ({ auth }) })
	} as unknown as ExecutionContext;
	try {
		return guard.canActivate(context);
	} catch (error) {
		if (!(error instanceof ForbiddenException)) throw error;
		return (error.getResponse() as { code: string }).code;
	}
}

const stale = { enrollmentPending: false, reauthUntil: null };
const confirmed = { enrollmentPending: false, reauthUntil: '2026-09-24T08:10:00Z' };
const enrolling = { enrollmentPending: true, reauthUntil: null };

describe('ReauthGuard', () => {
	it('wants a fresh confirmation on marked routes only', () => {
		expect(outcome(routes.removeTotp, stale)).toBe('REAUTH_REQUIRED');
		expect(outcome(routes.removeTotp, confirmed)).toBe(true);
		expect(outcome(routes.overview, stale)).toBe(true);
	});

	it('lets the first factor through during the setup, and only there', () => {
		expect(outcome(routes.addPasskey, enrolling)).toBe(true);
		expect(outcome(routes.addPasskey, stale)).toBe('REAUTH_REQUIRED');
		expect(outcome(routes.removeTotp, enrolling)).toBe('REAUTH_REQUIRED');
	});

	it('stays out of the demo, its personas have no password to confirm with', () => {
		expect(outcome(routes.removeTotp, stale, 'demo')).toBe(true);
	});
});
