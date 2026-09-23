import { z } from 'zod';

export const errorCodes = [
	'VALIDATION',
	'UNAUTHENTICATED',
	'INVALID_CREDENTIALS',
	'TOKEN_INVALID',
	'CSRF',
	'FORBIDDEN',
	'NOT_FOUND',
	'ALREADY_EXISTS',
	'INVALID_STATE',
	'TIME_OVERLAP',
	'PERIOD_LOCKED',
	'APPEND_ONLY',
	'RATE_LIMITED',
	'SANDBOX_LIMIT',
	'INTERNAL'
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const fieldIssueSchema = z.object({ field: z.string(), message: z.string() });

export const apiErrorSchema = z.discriminatedUnion('code', [
	z.object({
		code: z.literal('VALIDATION'),
		message: z.string(),
		details: z.array(fieldIssueSchema)
	}),
	z.object({
		code: z.enum(errorCodes).exclude(['VALIDATION']),
		message: z.string(),
		details: z.record(z.string(), z.unknown()).nullable()
	})
]);

export type FieldIssue = z.infer<typeof fieldIssueSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
