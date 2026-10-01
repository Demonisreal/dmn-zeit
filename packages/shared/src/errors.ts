import { z } from 'zod';

export const errorCodes = [
	'VALIDATION',
	'PAYLOAD_TOO_LARGE',
	'UNAUTHENTICATED',
	'INVALID_CREDENTIALS',
	'TOKEN_INVALID',
	'MFA_ENROLLMENT_REQUIRED',
	'REAUTH_REQUIRED',
	'CSRF',
	'FORBIDDEN',
	'NOT_FOUND',
	'ALREADY_EXISTS',
	'INVALID_STATE',
	'TIME_OVERLAP',
	'PERIOD_LOCKED',
	'APPEND_ONLY',
	'INVOICED',
	'RATE_LIMITED',
	'RENDER_BUSY',
	'SANDBOX_LIMIT',
	'SANDBOX_QUOTA',
	'INTERNAL'
] as const;

export type ErrorCode = (typeof errorCodes)[number];

// messages of our own checks are i18n keys; zod's built-in messages the web localizes by code
export const validationKeys = [
	'format.date',
	'format.month',
	'format.monthDay',
	'format.dayCount',
	'format.cents',
	'format.iban',
	'format.vatId',
	'format.entitlement',
	'format.token',
	'format.totp',
	'format.recoveryCode',
	'text.empty',
	'text.controlChars',
	'text.invoiceCharset',
	'range.required',
	'range.unordered',
	'range.tooLong',
	'absence.endBeforeStart',
	'absence.halfDaySingle',
	'correction.endBeforeStart',
	'flex.zeroMinutes',
	'flex.payoutPositive',
	'vacation.zeroDays',
	'team.duplicateLead',
	'project.endBeforeStart',
	'project.noteRequired',
	'rate.futureOnly',
	'invoice.rangeTooLong',
	'invoice.tooManyLines',
	'invoice.taxCategoryMismatch',
	'password.common'
] as const;

export type ValidationKey = (typeof validationKeys)[number];

export const fieldIssueSchema = z.object({
	field: z.string(),
	// the zod issue code, e.g. too_small, invalid_format or custom
	code: z.string(),
	message: z.string(),
	params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
});

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
