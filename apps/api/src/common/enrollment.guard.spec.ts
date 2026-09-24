import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AllowDuringEnrollment, EnrollmentGuard } from './enrollment.guard';

class Routes {
	@AllowDuringEnrollment()
	setup() {}

	entries() {}
}

const routes = new Routes();
const guard = new EnrollmentGuard(new Reflector());

function outcome(handler: () => void, auth: object | undefined) {
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

describe('EnrollmentGuard', () => {
	it('keeps a session without a second factor on the setup routes', () => {
		const enrolling = { enrollmentPending: true };
		expect(outcome(routes.setup, enrolling)).toBe(true);
		expect(outcome(routes.entries, enrolling)).toBe('MFA_ENROLLMENT_REQUIRED');
	});

	it('lets full sessions and public routes through', () => {
		expect(outcome(routes.entries, { enrollmentPending: false })).toBe(true);
		expect(outcome(routes.entries, undefined)).toBe(true);
	});
});
