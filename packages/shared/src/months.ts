import { z } from 'zod';
import {
	employeeRefSchema,
	explanationSchema,
	instantSchema,
	monthSchema,
	reasonSchema,
	userRefSchema,
	uuidSchema
} from './common';

export const checklistKinds = [
	'previous_month_open',
	'running_entry',
	'pending_correction',
	'pending_absence',
	'open_finding'
] as const;
export type ChecklistKind = (typeof checklistKinds)[number];

export const monthClosingActions = ['close', 'reopen'] as const;
export type MonthClosingAction = (typeof monthClosingActions)[number];

export const monthChecklistSchema = z.object({
	month: monthSchema,
	closed: z.boolean(),
	closable: z.boolean(),
	items: z.array(
		z.object({
			kind: z.enum(checklistKinds),
			blocking: z.boolean(),
			employees: z.array(employeeRefSchema),
			explanation: explanationSchema
		})
	),
	capPreview: z.array(
		z.object({
			employee: employeeRefSchema,
			forfeitedMinutes: z.int().refine((m) => m !== 0, 'months.zeroForfeit')
		})
	)
});

export const reopenMonthSchema = z.object({ reason: reasonSchema });

export const monthClosingSchema = z.object({
	id: uuidSchema,
	month: monthSchema,
	action: z.enum(monthClosingActions),
	reason: z.string().nullable(),
	actor: userRefSchema,
	at: instantSchema,
	capped: z.array(
		z.object({
			employee: employeeRefSchema,
			forfeitedMinutes: z.int().refine((m) => m !== 0, 'months.zeroForfeit')
		})
	)
});

export type MonthChecklist = z.infer<typeof monthChecklistSchema>;
export type ReopenMonthInput = z.infer<typeof reopenMonthSchema>;
export type MonthClosing = z.infer<typeof monthClosingSchema>;
