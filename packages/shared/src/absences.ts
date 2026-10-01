import { z } from 'zod';
import {
	dayCountSchema,
	emptyBodySchema,
	employeeRefSchema,
	explanationSchema,
	inRange,
	instantSchema,
	isoDateSchema,
	monthSchema,
	noteSchema,
	pageOf,
	pagingShape,
	portionSchema,
	queryList,
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
		error: 'absence.endBeforeStart',
		path: ['endDate']
	})
	.refine((a) => a.startDate !== a.endDate || !(a.halfDayStart && a.halfDayEnd), {
		error: 'absence.halfDaySingle',
		path: ['halfDayEnd']
	});

export const absencePreviewSchema = z.object({
	days: z.array(
		z.object({
			date: isoDateSchema,
			portion: z.literal([0, 0.5, 1]),
			targetMinutes: z.int().min(0),
			vacationDays: dayCountSchema,
			explanation: explanationSchema
		})
	),
	vacationDays: dayCountSchema,
	targetMinutes: z.int().min(0),
	allocations: z.array(z.object({ bucketYear: z.int(), days: dayCountSchema })),
	remainingAfter: dayCountSchema.nullable(),
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
	vacationDays: dayCountSchema,
	targetMinutes: z.int().min(0),
	requestedBy: userRefSchema,
	decidedBy: userRefSchema.nullable(),
	decidedAt: instantSchema.nullable(),
	decisionNote: z.string().nullable(),
	sickNote: z.object({ confirmedAt: instantSchema, confirmedBy: userRefSchema }).nullable(),
	createdAt: instantSchema,
	remainingAfter: dayCountSchema.nullable().optional(),
	concurrentAbsences: z
		.array(
			z.object({ employee: employeeRefSchema, startDate: isoDateSchema, endDate: isoDateSchema })
		)
		.optional(),
	balanceAfterMinutes: z.int().optional()
});

export const absencesQuerySchema = z
	.object({
		from: isoDateSchema.optional(),
		to: isoDateSchema.optional(),
		scope: z.enum(requestScopes).default('mine'),
		employee: uuidSchema.optional(),
		status: queryList(absenceStatuses),
		type: queryList(absenceTypes),
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

export const absencePageSchema = pageOf(absenceSchema);

export const cancelAbsenceSchema = z.object({ note: noteSchema.optional() });
export const confirmSickNoteSchema = emptyBodySchema;

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
export type AbsencePage = z.infer<typeof absencePageSchema>;
export type CancelAbsenceInput = z.infer<typeof cancelAbsenceSchema>;
export type TeamCalendarQuery = z.infer<typeof teamCalendarQuerySchema>;
export type TeamCalendar = z.infer<typeof teamCalendarSchema>;
