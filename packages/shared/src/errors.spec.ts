import { describe, expect, it } from 'vitest';
import { apiErrorSchema } from './errors';

describe('apiErrorSchema', () => {
	it('carries field issues for validation errors', () => {
		const parsed = apiErrorSchema.parse({
			code: 'VALIDATION',
			message: 'Invalid input',
			details: [{ field: 'reason', message: 'Too short' }]
		});
		expect(parsed.code).toBe('VALIDATION');
	});

	it('rejects a validation error without issues', () => {
		const parsed = apiErrorSchema.safeParse({
			code: 'VALIDATION',
			message: 'Invalid input',
			details: null
		});
		expect(parsed.success).toBe(false);
	});

	it('takes an object or null as details for everything else', () => {
		expect(
			apiErrorSchema.safeParse({
				code: 'TIME_OVERLAP',
				message: 'Overlaps an existing entry',
				details: { entryId: '7f1c0a52-3b7e-4d0c-9a51-2f8e6b1d4c3a' }
			}).success
		).toBe(true);
		expect(
			apiErrorSchema.safeParse({ code: 'NOT_FOUND', message: 'Not found', details: null }).success
		).toBe(true);
	});

	it('does not know made up codes', () => {
		expect(
			apiErrorSchema.safeParse({ code: 'TEAPOT', message: 'Short and stout', details: null })
				.success
		).toBe(false);
	});
});
