import { z } from 'zod';
import { absenceTypes } from './absences';
import { daysSchema, instantSchema, isoDateSchema, monthSchema, uuidSchema } from './common';
import { federalStates, holidayCodes } from './tenant';

export const exportFormats = ['csv', 'json'] as const;
export type ExportFormat = (typeof exportFormats)[number];

const exportedEmployee = z.object({
	id: uuidSchema,
	name: z.string(),
	personnelNo: z.string()
});

const totals = {
	targetMinutes: z.int().min(0),
	workedMinutes: z.int().min(0),
	creditedMinutes: z.int().min(0),
	diffMinutes: z.int()
};

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
			entries: z.array(z.object({ startedAt: instantSchema, endedAt: instantSchema })),
			breakMinutes: z.int().min(0),
			...totals,
			absence: z.enum(absenceTypes).nullable(),
			holiday: z.enum(holidayCodes).nullable()
		})
	),
	totals: z.object(totals),
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
			...totals,
			flexBalanceMinutes: z.int(),
			vacationDays: daysSchema,
			sickDays: daysSchema,
			openFindings: z.int().min(0)
		})
	),
	generatedAt: instantSchema
});

export type TimesheetQuery = z.infer<typeof timesheetQuerySchema>;
export type Timesheet = z.infer<typeof timesheetSchema>;
export type MonthOverviewQuery = z.infer<typeof monthOverviewQuerySchema>;
export type MonthOverview = z.infer<typeof monthOverviewSchema>;
