import { z } from 'zod';
import {
	employeeRefSchema,
	explanationSchema,
	inRange,
	instantSchema,
	isoDateSchema,
	noteSchema,
	rangeShape,
	userRefSchema,
	uuidSchema
} from './common';

export const arbzgCodes = [
	'ARBZG_3_OVER_8',
	'ARBZG_3_OVER_10',
	'ARBZG_4_BREAK_SHORT',
	'ARBZG_4_CONTINUOUS_6H',
	'ARBZG_5_REST_UNDER_11H',
	'ARBZG_9_SUNDAY',
	'ARBZG_9_HOLIDAY'
] as const;
export type ArbzgCode = (typeof arbzgCodes)[number];

export const findingSeverities = ['info', 'warning'] as const;
export type FindingSeverity = (typeof findingSeverities)[number];

export const findingStates = ['open', 'acknowledged'] as const;

export const findingSchema = z.object({
	employee: employeeRefSchema,
	date: isoDateSchema,
	code: z.enum(arbzgCodes),
	severity: z.enum(findingSeverities),
	ruleVersion: z.string(),
	facts: z.record(z.string(), z.union([z.string(), z.number()])),
	explanation: explanationSchema,
	ack: z
		.object({
			at: instantSchema,
			by: userRefSchema,
			note: z.string()
		})
		.nullable()
});

export const findingsQuerySchema = z
	.object({
		...rangeShape,
		employee: uuidSchema.optional(),
		state: z.enum(findingStates).optional()
	})
	.superRefine(inRange(366));

export const ackFindingSchema = z.object({
	employeeId: uuidSchema,
	date: isoDateSchema,
	code: z.enum(arbzgCodes),
	ruleVersion: z.string().min(1).max(40),
	note: noteSchema
});

export const ruleSetSchema = z.object({
	version: z.string(),
	validFrom: isoDateSchema,
	limits: z.object({
		regularDailyMinutes: z.int(),
		maxDailyMinutes: z.int(),
		breakOver6hMinutes: z.int(),
		breakOver9hMinutes: z.int(),
		minBreakMinutes: z.int(),
		maxContinuousMinutes: z.int(),
		minRestMinutes: z.int()
	})
});

export type Finding = z.infer<typeof findingSchema>;
export type FindingsQuery = z.infer<typeof findingsQuerySchema>;
export type AckFindingInput = z.infer<typeof ackFindingSchema>;
export type RuleSetInfo = z.infer<typeof ruleSetSchema>;
