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
	'PAGE_LIMIT',
	'SANDBOX_LIMIT',
	'SANDBOX_QUOTA',
	'INTERNAL'
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const validationKeys = [
	'format.date',
	'format.month',
	'format.monthDay',
	'format.dayCount',
	'format.cents',
	'format.iban',
	'format.vatId',
	'format.leitwegId',
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
	'invoice.tooManyEntries',
	'invoice.taxCategoryMismatch',
	'invoice.paidOnFuture',
	'invoice.exemptionReasonRequired',
	'invoice.exemptionReasonUnexpected',
	'report.tooManyEntries',
	'password.common'
] as const;

export type ValidationKey = (typeof validationKeys)[number];

export const fieldIssueSchema = z.object({
	field: z.string(),
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
