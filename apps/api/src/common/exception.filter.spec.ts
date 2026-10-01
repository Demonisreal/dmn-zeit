import {
	ArgumentsHost,
	BadRequestException,
	ConflictException,
	HttpException,
	NotFoundException,
	ServiceUnavailableException
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { DatabaseError } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { PageLimitError, RenderFailedError } from '../documents/render-limit';
import { ApiExceptionFilter, toApiError } from './exception.filter';

function answer(exception: unknown) {
	const json = vi.fn((_body: unknown) => {});
	const status = vi.fn((_code: number) => ({ json }));
	const setHeader = vi.fn();
	const host = {
		switchToHttp: () => ({ getResponse: () => ({ status, setHeader }) })
	} as unknown as ArgumentsHost;
	const filter = new ApiExceptionFilter();
	const logged = vi.spyOn(filter['logger'], 'error').mockImplementation(() => {});

	filter.catch(exception, host);
	return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0], logged, setHeader };
}

describe('toApiError', () => {
	it('passes an error that already has our shape', () => {
		const sandboxes = new ServiceUnavailableException({
			code: 'SANDBOX_LIMIT',
			message: 'Too many demo sandboxes',
			details: null
		});
		expect(toApiError(sandboxes)).toEqual({
			status: 503,
			body: { code: 'SANDBOX_LIMIT', message: 'Too many demo sandboxes', details: null }
		});
	});

	it('names nest exceptions after their status', () => {
		expect(toApiError(new NotFoundException('Cannot GET /api/nope'))?.body).toEqual({
			code: 'NOT_FOUND',
			message: 'Cannot GET /api/nope',
			details: null
		});
		expect(toApiError(new ThrottlerException('Too many requests'))?.body.code).toBe('RATE_LIMITED');
		expect(toApiError(new ConflictException('Already decided'))?.body.code).toBe('INVALID_STATE');
	});

	it('gives validation errors an issue list, even an empty one', () => {
		expect(toApiError(new BadRequestException('Malformed JSON'))?.body).toEqual({
			code: 'VALIDATION',
			message: 'Malformed JSON',
			details: []
		});
	});

	it('maps known database errors', () => {
		const overlap = new DatabaseError(
			'conflicting key value violates exclusion constraint',
			0,
			'error'
		);
		overlap.code = '23P01';
		expect(toApiError(overlap)).toMatchObject({ status: 409, body: { code: 'TIME_OVERLAP' } });
	});

	it('knows nothing about other errors', () => {
		expect(toApiError(new TypeError('x is undefined'))).toBeUndefined();
		expect(toApiError(new HttpException('Bad gateway', 502))).toBeUndefined();
	});
});

describe('ApiExceptionFilter', () => {
	it('answers unknown errors with a bare 500 and logs the real one', () => {
		const leak = new Error('relation "auth.credentials" does not exist');
		const { status, body, logged } = answer(leak);

		expect(status).toBe(500);
		expect(body).toEqual({ code: 'INTERNAL', message: 'Internal error', details: null });
		expect(logged).toHaveBeenCalledWith(leak);
	});

	it('does not log what it can answer', () => {
		const { status, logged } = answer(new NotFoundException());
		expect(status).toBe(404);
		expect(logged).not.toHaveBeenCalled();
	});

	it('answers a document past the page limit with 422 PAGE_LIMIT, nobody has to retry that', () => {
		const { status, body, logged, setHeader } = answer(new PageLimitError());
		expect(status).toBe(422);
		expect(body).toEqual({
			code: 'PAGE_LIMIT',
			message: 'Document runs past 50 pages',
			details: { maxPages: 50 }
		});
		expect(setHeader).not.toHaveBeenCalled();
		expect(logged).not.toHaveBeenCalled();
	});

	it('answers a document that failed a moment ago with 503 and the seconds until the next attempt', () => {
		const { status, body, setHeader } = answer(new RenderFailedError(12));
		expect(status).toBe(503);
		expect(body).toMatchObject({ code: 'RENDER_BUSY', details: null });
		expect(setHeader).toHaveBeenCalledWith('Retry-After', 12);
	});
});
