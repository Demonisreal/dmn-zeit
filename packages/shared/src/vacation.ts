import { z } from 'zod';
import {
	dayCountSchema,
	employeeRefSchema,
	explanationSchema,
	instantSchema,
	isoDateSchema,
	pageOf,
	pagingShape,
	queryYearSchema,
	reasonSchema,
	userRefSchema,
	uuidSchema,
	yearSchema
} from './common';

export const vacationEntryTypes = [
	'entitlement',
	'adjustment',
	'taken',
	'refund_sick',
	'refund_cancel',
	'expiry',
	'manual'
] as const;
export type VacationEntryType = (typeof vacationEntryTypes)[number];

export const noticeChannels = ['in_app', 'email', 'letter'] as const;
export type NoticeChannel = (typeof noticeChannels)[number];

export const expiryDecisions = ['not_due', 'forfeit', 'keep'] as const;
export type ExpiryDecision = (typeof expiryDecisions)[number];

export const vacationLedgerEntrySchema = z.object({
	id: uuidSchema,
	bucketYear: z.int(),
	entryType: z.enum(vacationEntryTypes),
	days: dayCountSchema,
	effectiveDate: isoDateSchema,
	absenceId: uuidSchema.nullable(),
	noticeId: uuidSchema.nullable(),
	reason: z.string().nullable(),
	createdAt: instantSchema
});

export const vacationBucketSchema = z.object({
	year: z.int(),
	entitlement: dayCountSchema,
	taken: dayCountSchema,
	refunded: dayCountSchema,
	adjusted: dayCountSchema,
	expired: dayCountSchema,
	remaining: dayCountSchema,
	deadline: isoDateSchema.nullable(),
	notice: z
		.object({
			id: uuidSchema,
			sentAt: instantSchema,
			deadline: isoDateSchema,
			acknowledgedAt: instantSchema.nullable()
		})
		.nullable(),
	expiry: z.object({
		decision: z.enum(expiryDecisions),
		explanation: explanationSchema
	})
});

export const vacationAccountSchema = z.object({
	employeeId: uuidSchema,
	year: z.int(),
	entitlement: z.object({
		days: dayCountSchema,
		explanations: z.array(explanationSchema)
	}),
	buckets: z.array(vacationBucketSchema),
	pending: dayCountSchema,
	available: dayCountSchema,
	ledger: z.array(vacationLedgerEntrySchema)
});

export const vacationQuerySchema = z.object({ year: queryYearSchema });

export const createVacationAdjustmentSchema = z.object({
	bucketYear: yearSchema,
	days: dayCountSchema.refine((days) => Number(days) !== 0, 'vacation.zeroDays'),
	effectiveDate: isoDateSchema,
	reason: reasonSchema
});

export const createVacationNoticesSchema = z.object({
	bucketYear: yearSchema,
	employeeIds: z.array(uuidSchema).min(1).max(500),
	channel: z.enum(noticeChannels)
});

export const vacationNoticeSchema = z.object({
	id: uuidSchema,
	employee: employeeRefSchema,
	bucketYear: z.int(),
	remainingDays: dayCountSchema,
	deadline: isoDateSchema,
	sentAt: instantSchema,
	sentBy: userRefSchema,
	channel: z.enum(noticeChannels),
	textVersion: z.string(),
	acknowledgedAt: instantSchema.nullable()
});

export const vacationNoticesQuerySchema = z.object({ year: queryYearSchema, ...pagingShape });
export const vacationNoticePageSchema = pageOf(vacationNoticeSchema);

export const sendVacationNoticesResultSchema = z.object({
	sent: z.array(vacationNoticeSchema),
	skipped: z.array(employeeRefSchema)
});

export type VacationLedgerEntry = z.infer<typeof vacationLedgerEntrySchema>;
export type VacationBucket = z.infer<typeof vacationBucketSchema>;
export type VacationAccount = z.infer<typeof vacationAccountSchema>;
export type VacationQuery = z.infer<typeof vacationQuerySchema>;
export type CreateVacationAdjustmentInput = z.infer<typeof createVacationAdjustmentSchema>;
export type CreateVacationNoticesInput = z.infer<typeof createVacationNoticesSchema>;
export type VacationNotice = z.infer<typeof vacationNoticeSchema>;
export type VacationNoticesQuery = z.infer<typeof vacationNoticesQuerySchema>;
export type VacationNoticePage = z.infer<typeof vacationNoticePageSchema>;
export type SendVacationNoticesResult = z.infer<typeof sendVacationNoticesResultSchema>;
