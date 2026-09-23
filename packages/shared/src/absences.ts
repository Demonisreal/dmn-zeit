import { z } from 'zod';
import {
	daysSchema,
	employeeRefSchema,
	explanationSchema,
	instantSchema,
	isOrdered,
	isoDateSchema,
	monthSchema,
	noteSchema,
	orderIssue,
	portionSchema,
	requestScopes,
	userRefSchema,
	uuidSchema
} from './common';
import { holidaySchema } from './tenant';

export const absenceTypes = ['vacation', 'sick', 'time_off'] as const;
export type AbsenceType = (typeof absenceTypes)[number];

export const absenceStatuses = [
	'pending',
	'approved',
	'rejected',
	'withdrawn',
	'cancel_pending',
	'cancelled'
] as const;
export type AbsenceStatus = (typeof absenceStatuses)[number];

// used by preview and create, the preview answers what the request would cost
export const createAbsenceSchema = z
	.object({
		employeeId: uuidSchema,
		type: z.enum(absenceTypes),
		startDate: isoDateSchema,
		endDate: isoDateSchema,
		halfDayStart: z.boolean().default(false),
		halfDayEnd: z.boolean().default(false),
		note: noteSchema.optional()
	})
	.refine((a) => a.startDate <= a.endDate, {
		error: 'End date is before start date',
		path: ['endDate']
	})
	.refine((a) => a.startDate !== a.endDate || !(a.halfDayStart && a.halfDayEnd), {
		error: 'A single day is either half or whole',
		path: ['halfDayEnd']
	});

export const absencePreviewSchema = z.object({
	days: z.array(
		z.object({
			date: isoDateSchema,
			// 0 marks a day without target time, it stays in the list for the explanation
			portion: z.literal([0, 0.5, 1]),
			targetMinutes: z.int().min(0),
			vacationDays: daysSchema,
			explanation: explanationSchema
		})
	),
	vacationDays: daysSchema,
	targetMinutes: z.int().min(0),
	allocations: z.array(z.object({ bucketYear: z.int(), days: daysSchema })),
	remainingAfter: daysSchema.nullable(),
	overlapsWith: z.array(uuidSchema)
});

export const absenceSchema = z.object({
	id: uuidSchema,
	employee: employeeRefSchema,
	type: z.enum(absenceTypes),
	startDate: isoDateSchema,
	endDate: isoDateSchema,
	halfDayStart: z.boolean(),
	halfDayEnd: z.boolean(),
	status: z.enum(absenceStatuses),
	note: z.string().nullable(),
	vacationDays: daysSchema,
	targetMinutes: z.int().min(0),
	requestedBy: userRefSchema,
	decidedBy: userRefSchema.nullable(),
	decidedAt: instantSchema.nullable(),
	decisionNote: z.string().nullable(),
	createdAt: instantSchema
});

export const absencesQuerySchema = z
	.object({
		scope: z.enum(requestScopes).default('mine'),
		status: z.enum(absenceStatuses).optional(),
		type: z.enum(absenceTypes).optional(),
		from: isoDateSchema.optional(),
		to: isoDateSchema.optional()
	})
	.refine(isOrdered, orderIssue);

export const cancelAbsenceSchema = z.object({ note: noteSchema.optional() });

export const teamCalendarQuerySchema = z.object({
	month: monthSchema,
	team: uuidSchema.optional()
});

export const teamCalendarSchema = z.object({
	month: monthSchema,
	holidays: z.array(holidaySchema),
	people: z.array(
		z.object({
			employee: employeeRefSchema,
			days: z.array(
				z.object({
					date: isoDateSchema,
					portion: portionSchema,
					// employees only learn that a colleague is away, not why
					type: z.enum([...absenceTypes, 'absent']),
					status: z.enum(['pending', 'approved', 'cancel_pending']).nullable()
				})
			)
		})
	)
});

export type CreateAbsenceInput = z.infer<typeof createAbsenceSchema>;
export type AbsencePreview = z.infer<typeof absencePreviewSchema>;
export type Absence = z.infer<typeof absenceSchema>;
export type AbsencesQuery = z.infer<typeof absencesQuerySchema>;
export type CancelAbsenceInput = z.infer<typeof cancelAbsenceSchema>;
export type TeamCalendarQuery = z.infer<typeof teamCalendarQuerySchema>;
export type TeamCalendar = z.infer<typeof teamCalendarSchema>;
