import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { csrfTokenFor, hashToken } from '../auth/tokens';
import { CsrfGuard } from './csrf.guard';
import { Public } from './session.guard';

class Routes {
	@Public()
	login() {}

	logout() {}
}

const routes = new Routes();
const csrf = csrfTokenFor('session-token');
const guard = new CsrfGuard(
	new Reflector(),
	new ConfigService({ APP_ORIGIN: 'https://zeit.example.com' })
);

type Call = {
	method?: string;
	json?: boolean;
	headers?: Record<string, string>;
	handler?: () => void;
};

function context({ method = 'POST', json = true, headers = {}, handler = routes.logout }: Call) {
	const request = {
		method,
		headers,
		auth: { csrfHash: hashToken(csrf) },
		is: (type: string) => (json && type === 'application/json' ? type : false),
		header: (name: string) => headers[name.toLowerCase()]
	};
	return {
		getHandler: () => handler,
		getClass: () => Routes,
		switchToHttp: () => ({ getRequest: () => request })
	} as unknown as ExecutionContext;
}

function refusal(call: Call) {
	try {
		guard.canActivate(context(call));
		return 'passed';
	} catch (error) {
		if (!(error instanceof ForbiddenException)) throw error;
		return (error.getResponse() as { message: string }).message;
	}
}

const sameOrigin = { 'sec-fetch-site': 'same-origin', 'x-csrf-token': csrf };

describe('CsrfGuard', () => {
	it('lets reads through without any check', () => {
		expect(refusal({ method: 'GET', json: false })).toBe('passed');
		expect(refusal({ method: 'HEAD', json: false })).toBe('passed');
	});

	it('takes a same-origin json write with the right token', () => {
		expect(refusal({ headers: sameOrigin })).toBe('passed');
	});

	it('wants json, a form post cannot send it without a preflight', () => {
		expect(refusal({ json: false, headers: sameOrigin })).toMatch(/application\/json/);
	});

	it('refuses writes from other sites, same-site included', () => {
		expect(refusal({ headers: { ...sameOrigin, 'sec-fetch-site': 'cross-site' } })).toMatch(
			/Cross-origin/
		);
		expect(refusal({ headers: { ...sameOrigin, 'sec-fetch-site': 'same-site' } })).toMatch(
			/Cross-origin/
		);
	});

	it('falls back to the origin header when the browser sends no fetch metadata', () => {
		const token = { 'x-csrf-token': csrf };
		expect(refusal({ headers: { ...token, origin: 'https://zeit.example.com' } })).toBe('passed');
		expect(
			refusal({ headers: { ...token, origin: 'https://zeit.example.com.evil.test' } })
		).toMatch(/Cross-origin/);
		expect(refusal({ headers: token })).toMatch(/Cross-origin/);
	});

	it('refuses a missing or wrong token', () => {
		expect(refusal({ headers: { 'sec-fetch-site': 'same-origin' } })).toMatch(/token/);
		expect(refusal({ headers: { ...sameOrigin, 'x-csrf-token': csrfTokenFor('other') } })).toMatch(
			/token/
		);
		expect(refusal({ headers: { ...sameOrigin, 'x-csrf-token': 'short' } })).toMatch(/token/);
	});

	it('checks only origin and content type on public routes, there is no session yet', () => {
		expect(refusal({ handler: routes.login, headers: { 'sec-fetch-site': 'same-origin' } })).toBe(
			'passed'
		);
		expect(refusal({ handler: routes.login, headers: { 'sec-fetch-site': 'cross-site' } })).toMatch(
			/Cross-origin/
		);
	});
});
