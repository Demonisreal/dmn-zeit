import { BadRequestException } from '@nestjs/common';
import { apiErrorSchema } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodPipe } from './zod.pipe';

const schema = z
	.object({
		reason: z.string().min(10),
		days: z.number().max(30),
		from: z.string(),
		to: z.string()
	})
	.refine((range) => range.from <= range.to, {
		message: 'range.unordered',
		path: ['to'],
		params: { max: 62 }
	});

function issues(input: unknown) {
	try {
		new ZodPipe(schema).transform(input, { type: 'body' });
	} catch (error) {
		if (!(error instanceof BadRequestException)) throw error;
		return error.getResponse();
	}
	throw new Error('expected a validation error');
}

describe('ZodPipe', () => {
	it('passes parsed input through', () => {
		const input = { reason: 'Arzttermin am Morgen', days: 2, from: '2026-03-02', to: '2026-03-06' };
		expect(new ZodPipe(schema).transform(input, { type: 'body' })).toEqual(input);
	});

	it('answers in the contract shape, with code and limits for the web to phrase', () => {
		const answer = issues({ reason: 'kurz', days: 31, from: '2026-03-02', to: '2026-03-06' });
		expect(apiErrorSchema.safeParse(answer).success).toBe(true);
		expect(answer).toMatchObject({
			code: 'VALIDATION',
			details: [
				{ field: 'reason', code: 'too_small', params: { origin: 'string', minimum: 10 } },
				{ field: 'days', code: 'too_big', params: { origin: 'number', maximum: 30 } }
			]
		});
	});

	it('keeps the key and params of our own checks', () => {
		expect(
			issues({ reason: 'Arzttermin am Morgen', days: 2, from: '2026-03-06', to: '2026-03-02' })
		).toMatchObject({
			details: [{ field: 'to', code: 'custom', message: 'range.unordered', params: { max: 62 } }]
		});
	});
});
