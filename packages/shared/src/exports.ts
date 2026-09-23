import { z } from 'zod';
import { absenceTypes } from './absences';
import {
	dayCountSchema,
	instantSchema,
	isoDateSchema,
	monthSchema,
	portionSchema,
	uuidSchema
} from './common';
import { federalStates, holidayCodes } from './tenant';
import { totalsSchema } from './time';

export const exportFormats = ['csv', 'json'] as const;
export type ExportFormat = (typeof exportFormats)[number];

const exportedEmployee = z.object({
	id: uuidSchema,
	name: z.string(),
	personnelNo: z.string()
});

export const timesheetQuerySchema = z.object({
	employee: uuidSchema,
	month: monthSchema,
	format: z.enum(exportFormats).default('csv')
});

export const timesheetSchema = z.object({
	tenant: z.object({ name: z.string(), state: z.enum(federalStates) }),
	employee: exportedEmployee,
	month: monthSchema,
	closed: z.boolean(),
	days: z.array(
		z.object({
			date: isoDateSchema,
			entries: z.array(z.object({ startedAt: instantSchema, endedAt: instantSchema.nullable() })),
			breakMinutes: z.int().min(0),
			...totalsSchema.shape,
			absence: z.object({ type: z.enum(absenceTypes), portion: portionSchema }).nullable(),
			holiday: z.enum(holidayCodes).nullable()
		})
	),
	totals: totalsSchema,
	flexBalanceMinutes: z.int(),
	generatedAt: instantSchema
});

export const monthOverviewQuerySchema = z.object({
	month: monthSchema,
	format: z.enum(exportFormats).default('csv')
});

export const monthOverviewSchema = z.object({
	month: monthSchema,
	closed: z.boolean(),
	rows: z.array(
		z.object({
			employee: exportedEmployee,
			...totalsSchema.shape,
			flexBalanceMinutes: z.int(),
			vacationDays: dayCountSchema,
			sickDays: dayCountSchema,
			openFindings: z.int().min(0)
		})
	),
	generatedAt: instantSchema
});

export type TimesheetQuery = z.infer<typeof timesheetQuerySchema>;
export type Timesheet = z.infer<typeof timesheetSchema>;
export type MonthOverviewQuery = z.infer<typeof monthOverviewQuerySchema>;
export type MonthOverview = z.infer<typeof monthOverviewSchema>;
