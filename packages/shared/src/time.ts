import { z } from 'zod';
import { absenceStatuses, absenceTypes } from './absences';
import {
	explanationSchema,
	instantSchema,
	isOrdered,
	isoDateSchema,
	monthSchema,
	orderIssue,
	portionSchema,
	uuidSchema
} from './common';
import { arbzgCodes } from './compliance';
import { holidayCodes } from './tenant';

export const entrySources = ['clock', 'correction', 'seed'] as const;
export type EntrySource = (typeof entrySources)[number];

export const endReasons = ['break', 'leave'] as const;
export type EndReason = (typeof endReasons)[number];

export const timeEntrySchema = z.object({
	id: uuidSchema,
	employeeId: uuidSchema,
	workday: isoDateSchema,
	startedAt: instantSchema,
	endedAt: instantSchema.nullable(),
	endReason: z.enum(endReasons).nullable(),
	source: z.enum(entrySources),
	requestId: uuidSchema.nullable(),
	voidedAt: instantSchema.nullable()
});

export const entriesQuerySchema = z
	.object({
		from: isoDateSchema,
		to: isoDateSchema
	})
	.refine(isOrdered, orderIssue);

export const daysQuerySchema = z.object({ month: monthSchema });

const totals = {
	targetMinutes: z.int().min(0),
	workedMinutes: z.int().min(0),
	creditedMinutes: z.int().min(0),
	diffMinutes: z.int()
};

export const daySchema = z.object({
	date: isoDateSchema,
	...totals,
	breakMinutes: z.int().min(0),
	firstStart: instantSchema.nullable(),
	lastEnd: instantSchema.nullable(),
	running: z.boolean(),
	holiday: z.object({ code: z.enum(holidayCodes), portion: portionSchema }).nullable(),
	absence: z
		.object({
			requestId: uuidSchema,
			type: z.enum(absenceTypes),
			status: z.enum(absenceStatuses),
			portion: portionSchema
		})
		.nullable(),
	findings: z.array(z.enum(arbzgCodes)),
	locked: z.boolean(),
	explanations: z.array(explanationSchema)
});

export const monthDaysSchema = z.object({
	employeeId: uuidSchema,
	month: monthSchema,
	closedThrough: isoDateSchema.nullable(),
	days: z.array(daySchema),
	totals: z.object(totals)
});

export type TimeEntry = z.infer<typeof timeEntrySchema>;
export type EntriesQuery = z.infer<typeof entriesQuerySchema>;
export type DaysQuery = z.infer<typeof daysQuerySchema>;
export type Day = z.infer<typeof daySchema>;
export type MonthDays = z.infer<typeof monthDaysSchema>;
