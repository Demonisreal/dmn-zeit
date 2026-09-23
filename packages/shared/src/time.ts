import { z } from 'zod';
import { absenceStatuses, absenceTypes } from './absences';
import {
	explanationSchema,
	inRange,
	instantSchema,
	isoDateSchema,
	pageOf,
	pagingShape,
	portionSchema,
	rangeShape,
	uuidSchema
} from './common';
import { findingSchema } from './compliance';
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
	.object({ ...rangeShape, ...pagingShape })
	.superRefine(inRange(62));

export const timeEntryPageSchema = pageOf(timeEntrySchema);

// a calendar week can span two months, so week and month view ask by date range
export const daysQuerySchema = z.object(rangeShape).superRefine(inRange(62));

export const totalsSchema = z.object({
	targetMinutes: z.int().min(0),
	workedMinutes: z.int().min(0),
	creditedMinutes: z.int().min(0),
	diffMinutes: z.int()
});

export const daySchema = z.object({
	date: isoDateSchema,
	target: z.object({ minutes: z.int().min(0), explanation: explanationSchema }),
	workedMinutes: z.int().min(0),
	creditedMinutes: z.int().min(0),
	diffMinutes: z.int(),
	breakMinutes: z.int().min(0),
	running: z.boolean(),
	entries: z.array(
		timeEntrySchema.pick({
			id: true,
			startedAt: true,
			endedAt: true,
			endReason: true,
			source: true
		})
	),
	holiday: z.object({ code: z.enum(holidayCodes), portion: portionSchema }).nullable(),
	absence: z
		.object({
			requestId: uuidSchema,
			type: z.enum(absenceTypes),
			status: z.enum(absenceStatuses),
			portion: portionSchema
		})
		.nullable(),
	findings: z.array(findingSchema.omit({ employee: true, date: true })),
	locked: z.boolean()
});

export const dayRangeSchema = z.object({
	employeeId: uuidSchema,
	from: isoDateSchema,
	to: isoDateSchema,
	closedThrough: isoDateSchema.nullable(),
	days: z.array(daySchema),
	totals: totalsSchema
});

export type TimeEntry = z.infer<typeof timeEntrySchema>;
export type EntriesQuery = z.infer<typeof entriesQuerySchema>;
export type TimeEntryPage = z.infer<typeof timeEntryPageSchema>;
export type DaysQuery = z.infer<typeof daysQuerySchema>;
export type Totals = z.infer<typeof totalsSchema>;
export type Day = z.infer<typeof daySchema>;
export type DayRange = z.infer<typeof dayRangeSchema>;
