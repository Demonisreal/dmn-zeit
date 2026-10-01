import { z } from 'zod';
import {
	employeeRefSchema,
	inRange,
	instantSchema,
	isoDateSchema,
	pageOf,
	pagingShape,
	queryList,
	reasonSchema,
	requestScopes,
	userRefSchema,
	uuidSchema
} from './common';

export const correctionActions = ['add', 'change', 'void'] as const;
export type CorrectionAction = (typeof correctionActions)[number];

export const correctionStatuses = ['pending', 'approved', 'rejected', 'withdrawn'] as const;
export type CorrectionStatus = (typeof correctionStatuses)[number];

const span = { startedAt: instantSchema, endedAt: instantSchema };

export const createCorrectionSchema = z
	.discriminatedUnion('action', [
		z.object({ action: z.literal('add'), employeeId: uuidSchema, ...span, reason: reasonSchema }),
		z.object({ action: z.literal('change'), entryId: uuidSchema, ...span, reason: reasonSchema }),
		z.object({ action: z.literal('void'), entryId: uuidSchema, reason: reasonSchema })
	])
	.refine((c) => c.action === 'void' || Date.parse(c.endedAt) > Date.parse(c.startedAt), {
		error: 'correction.endBeforeStart',
		path: ['endedAt']
	});

export const correctionSchema = z.object({
	id: uuidSchema,
	employee: employeeRefSchema,
	action: z.enum(correctionActions),
	target: z
		.object({
			entryId: uuidSchema,
			startedAt: instantSchema,
			endedAt: instantSchema.nullable()
		})
		.nullable(),
	newStartedAt: instantSchema.nullable(),
	newEndedAt: instantSchema.nullable(),
	reason: z.string(),
	status: z.enum(correctionStatuses),
	requestedBy: userRefSchema,
	decidedBy: userRefSchema.nullable(),
	decidedAt: instantSchema.nullable(),
	decisionNote: z.string().nullable(),
	createdAt: instantSchema
});

export const correctionsQuerySchema = z
	.object({
		from: isoDateSchema.optional(),
		to: isoDateSchema.optional(),
		scope: z.enum(requestScopes).default('mine'),
		employee: uuidSchema.optional(),
		status: queryList(correctionStatuses),
		...pagingShape
	})
	.superRefine((query, ctx) => {
		if (query.scope === 'inbox') return;
		if (query.from === undefined || query.to === undefined) {
			ctx.addIssue({ code: 'custom', message: 'range.required', path: ['from'] });
			return;
		}
		inRange(366)({ from: query.from, to: query.to }, ctx);
	});

export const correctionPageSchema = pageOf(correctionSchema);

export type CreateCorrectionInput = z.infer<typeof createCorrectionSchema>;
export type Correction = z.infer<typeof correctionSchema>;
export type CorrectionsQuery = z.infer<typeof correctionsQuerySchema>;
export type CorrectionPage = z.infer<typeof correctionPageSchema>;
