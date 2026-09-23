import { z } from 'zod';
import {
	employeeRefSchema,
	instantSchema,
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
		error: 'End has to be after start',
		path: ['endedAt']
	});

export const correctionSchema = z.object({
	id: uuidSchema,
	employee: employeeRefSchema,
	action: z.enum(correctionActions),
	targetEntryId: uuidSchema.nullable(),
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

export const correctionsQuerySchema = z.object({
	scope: z.enum(requestScopes).default('mine'),
	status: z.enum(correctionStatuses).optional()
});

export type CreateCorrectionInput = z.infer<typeof createCorrectionSchema>;
export type Correction = z.infer<typeof correctionSchema>;
export type CorrectionsQuery = z.infer<typeof correctionsQuerySchema>;
