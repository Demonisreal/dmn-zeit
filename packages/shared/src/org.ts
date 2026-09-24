import { z } from 'zod';
import {
	capMinutesSchema,
	instantSchema,
	isoDateSchema,
	plainText,
	userRefSchema,
	uuidSchema
} from './common';

export const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof weekdays)[number];

const dayMinutes = z.int().min(0).max(600);

export const weekdayMinutesSchema = z.object({
	mon: dayMinutes,
	tue: dayMinutes,
	wed: dayMinutes,
	thu: dayMinutes,
	fri: dayMinutes,
	sat: dayMinutes,
	sun: dayMinutes
});

const nameSchema = plainText(80);
const personnelNoSchema = plainText(20);
// contracts store numeric(4,1)
const entitlementSchema = z.string().regex(/^\d{1,2}(\.\d)?$/, 'format.entitlement');

export const workModelSchema = z.object({
	id: uuidSchema,
	name: z.string(),
	minutes: weekdayMinutesSchema,
	archivedAt: instantSchema.nullable()
});

export const workModelsQuerySchema = z.object({
	includeArchived: z.stringbool().default(false)
});

export const createWorkModelSchema = z.object({
	name: nameSchema,
	minutes: weekdayMinutesSchema
});

export const updateWorkModelSchema = z
	.object({
		name: nameSchema,
		minutes: weekdayMinutesSchema,
		archived: z.boolean()
	})
	.partial();

export const contractSchema = z.object({
	id: uuidSchema,
	employeeId: uuidSchema,
	validFrom: isoDateSchema,
	workModelId: uuidSchema,
	minutes: weekdayMinutesSchema,
	vacationDaysYear: entitlementSchema,
	vacationBasisDays: z.int(),
	flexCapPlusMinutes: z.int().nullable(),
	flexCapMinusMinutes: z.int().nullable(),
	createdAt: instantSchema
});

// the minutes are copied from the work model, later edits to the model leave the contract alone
export const createContractSchema = z.object({
	validFrom: isoDateSchema,
	workModelId: uuidSchema,
	vacationDaysYear: entitlementSchema,
	vacationBasisDays: z.int().min(1).max(7).default(5),
	flexCapPlusMinutes: capMinutesSchema.nullable().default(null),
	flexCapMinusMinutes: capMinutesSchema.nullable().default(null)
});

export const employeeSchema = z.object({
	id: uuidSchema,
	personnelNo: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	teamId: uuidSchema.nullable(),
	userId: uuidSchema.nullable(),
	entryDate: isoDateSchema,
	exitDate: isoDateSchema.nullable(),
	closedThrough: isoDateSchema.nullable()
});

export const employeesQuerySchema = z.object({
	team: uuidSchema.optional(),
	includeExited: z.stringbool().default(false)
});

// the first contract starts on the entry date, so an employee never exists without one
export const createEmployeeSchema = z.object({
	personnelNo: personnelNoSchema,
	firstName: nameSchema,
	lastName: nameSchema,
	teamId: uuidSchema.nullable().default(null),
	entryDate: isoDateSchema,
	contract: createContractSchema.omit({ validFrom: true })
});

export const updateEmployeeSchema = z
	.object({
		personnelNo: personnelNoSchema,
		firstName: nameSchema,
		lastName: nameSchema,
		teamId: uuidSchema.nullable()
	})
	.partial();

export const employeeExitSchema = z.object({ exitDate: isoDateSchema });

export const teamSchema = z.object({
	id: uuidSchema,
	name: z.string(),
	leads: z.array(userRefSchema),
	memberCount: z.int().min(0)
});

export const createTeamSchema = z.object({ name: nameSchema });
export const updateTeamSchema = createTeamSchema.partial();

export const teamLeadsSchema = z.object({
	userIds: z
		.array(uuidSchema)
		.max(20)
		.refine((ids) => new Set(ids).size === ids.length, 'team.duplicateLead')
});

export type WeekdayMinutes = z.infer<typeof weekdayMinutesSchema>;
export type WorkModel = z.infer<typeof workModelSchema>;
export type WorkModelsQuery = z.infer<typeof workModelsQuerySchema>;
export type CreateWorkModelInput = z.infer<typeof createWorkModelSchema>;
export type UpdateWorkModelInput = z.infer<typeof updateWorkModelSchema>;
export type Contract = z.infer<typeof contractSchema>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type Employee = z.infer<typeof employeeSchema>;
export type EmployeesQuery = z.infer<typeof employeesQuerySchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type EmployeeExitInput = z.infer<typeof employeeExitSchema>;
export type Team = z.infer<typeof teamSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type TeamLeadsInput = z.infer<typeof teamLeadsSchema>;
