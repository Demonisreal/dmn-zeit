import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { bodyErrors } from './body-errors';

function forwarded(error: Error & { type?: string; status?: number }) {
	let passed: unknown;
	bodyErrors(error, {} as Request, {} as Response, (next) => (passed = next));
	return passed;
}

function parserError(type: string, status: number, message = 'from body-parser') {
	return Object.assign(new Error(message), { type, status, expose: true });
}

describe('bodyErrors', () => {
	it('turns an oversized body into PAYLOAD_TOO_LARGE', () => {
		const passed = forwarded(parserError('entity.too.large', 413)) as HttpException;
		expect(passed.getStatus()).toBe(413);
		expect(passed.getResponse()).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', details: null });
	});

	it('answers broken json without echoing the parser message', () => {
		const passed = forwarded(
			parserError('entity.parse.failed', 400, `Unexpected token 'x', "x{" is not valid JSON`)
		) as HttpException;
		expect(passed.getResponse()).toEqual({
			code: 'VALIDATION',
			message: 'Malformed JSON',
			details: []
		});
	});

	it('keeps the status of other client errors and leaves the rest alone', () => {
		expect((forwarded(parserError('charset.unsupported', 415)) as HttpException).getStatus()).toBe(
			415
		);
		const broken = new Error('something else');
		expect(forwarded(broken)).toBe(broken);
	});
});
