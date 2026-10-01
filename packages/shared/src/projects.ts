import { z } from 'zod';
import {
	centsSchema,
	emailSchema,
	explanationSchema,
	inRange,
	instantSchema,
	invoicePlainText,
	isoDateSchema,
	noteSchema,
	plainText,
	rangeShape,
	uuidSchema
} from './common';
import { locales } from './users';

export const roundingModes = ['up', 'nearest', 'down'] as const;
export type RoundingMode = (typeof roundingModes)[number];

export const projectEntrySources = ['timer', 'manual', 'seed'] as const;
export type ProjectEntrySource = (typeof projectEntrySources)[number];

// same raster as app.projects/app.clients, billing.ts reuses it for the billing profile
export const roundingIncrementSchema = z.literal([1, 5, 6, 10, 15, 30, 60]);
const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/);
// I-06: project/task names become a time line's description and the client name its buyer snapshot,
// both end up on the invoice PDF, so all three stay within the invoice font's character set
const clientName = invoicePlainText(120);
const projectName = invoicePlainText(120);
const taskName = invoicePlainText(80);

export const clientSchema = z.object({
	id: uuidSchema,
	number: z.string().nullable(),
	name: z.string(),
	street: z.string().nullable(),
	postalCode: z.string().nullable(),
	city: z.string().nullable(),
	countryCode: countryCodeSchema,
	isBusiness: z.boolean(),
	vatId: z.string().nullable(),
	email: z.string().nullable(),
	buyerReference: z.string().nullable(),
	invoiceLocale: z.enum(locales),
	paymentTermsDays: z.int().nullable(),
	roundingIncrementMin: roundingIncrementSchema.nullable(),
	roundingMode: z.enum(roundingModes).nullable(),
	archivedAt: instantSchema.nullable(),
	restrictedAt: instantSchema.nullable()
});

// archiving and restricting have their own routes and never ride along in a patch
const clientInput = z.strictObject({
	number: invoicePlainText(20).nullable(),
	name: clientName,
	street: invoicePlainText(120).nullable(),
	postalCode: invoicePlainText(10).nullable(),
	city: invoicePlainText(80).nullable(),
	countryCode: countryCodeSchema,
	isBusiness: z.boolean(),
	vatId: invoicePlainText(20).nullable(),
	email: emailSchema.nullable(),
	buyerReference: invoicePlainText(100).nullable(),
	invoiceLocale: z.enum(locales),
	paymentTermsDays: z.int().min(0).max(120).nullable(),
	roundingIncrementMin: roundingIncrementSchema.nullable(),
	roundingMode: z.enum(roundingModes).nullable()
});

export const createClientSchema = clientInput.partial().extend({
	name: clientName,
	countryCode: countryCodeSchema.default('DE'),
	isBusiness: z.boolean().default(true),
	invoiceLocale: z.enum(locales).default('de')
});

// not derived from the create schema, partial() would fill in its defaults on every patch
export const updateClientSchema = clientInput.partial();

export const budgetStateSchema = z.enum(['ok', 'warn', 'exceeded']);

export const budgetStatusSchema = z.object({
	minutes: z.int(),
	usedMinutes: z.int(),
	state: budgetStateSchema,
	explanation: explanationSchema
});

export const projectSchema = z.object({
	id: uuidSchema,
	clientId: uuidSchema,
	name: z.string(),
	code: z.string().nullable(),
	billable: z.boolean(),
	budget: budgetStatusSchema.nullable(),
	roundingIncrementMin: roundingIncrementSchema.nullable(),
	roundingMode: z.enum(roundingModes).nullable(),
	openToAll: z.boolean(),
	archivedAt: instantSchema.nullable()
});

const projectInput = z.strictObject({
	name: projectName,
	code: plainText(20).nullable(),
	billable: z.boolean(),
	budgetMinutes: z.int32().min(1).nullable(),
	roundingIncrementMin: roundingIncrementSchema.nullable(),
	roundingMode: z.enum(roundingModes).nullable(),
	openToAll: z.boolean()
});

export const createProjectSchema = projectInput.partial().extend({
	clientId: uuidSchema,
	name: projectName,
	billable: z.boolean().default(true),
	openToAll: z.boolean().default(true)
});

// rates reference (client, project), so a project stays with the client it was created for
export const updateProjectSchema = projectInput.partial();

export const taskSchema = z.object({
	id: uuidSchema,
	projectId: uuidSchema,
	name: z.string(),
	billable: z.boolean().nullable(),
	archivedAt: instantSchema.nullable()
});

export const createTaskSchema = z.strictObject({
	name: taskName,
	// null leaves it to the project
	billable: z.boolean().nullable().optional()
});

export const updateTaskSchema = createTaskSchema.partial();

export const rateSchema = z.object({
	id: uuidSchema,
	clientId: uuidSchema.nullable(),
	projectId: uuidSchema.nullable(),
	taskId: uuidSchema.nullable(),
	employeeId: uuidSchema.nullable(),
	validFrom: isoDateSchema,
	rateCents: centsSchema,
	createdBy: uuidSchema.nullable()
});

export const createRateSchema = z.strictObject({
	clientId: uuidSchema.nullable().optional(),
	projectId: uuidSchema.nullable().optional(),
	taskId: uuidSchema.nullable().optional(),
	employeeId: uuidSchema.nullable().optional(),
	validFrom: isoDateSchema,
	rateCents: centsSchema
});

export const projectEntrySchema = z.object({
	id: uuidSchema,
	employeeId: uuidSchema,
	projectId: uuidSchema,
	taskId: uuidSchema.nullable(),
	startedAt: instantSchema,
	endedAt: instantSchema.nullable(),
	workday: isoDateSchema,
	note: z.string().nullable(),
	billable: z.boolean().nullable(),
	source: z.enum(projectEntrySources),
	invoiceId: uuidSchema.nullable(),
	voidedAt: instantSchema.nullable()
});

const endsAfterStart = (entry: { startedAt?: string | undefined; endedAt?: string | undefined }) =>
	entry.startedAt === undefined ||
	entry.endedAt === undefined ||
	Date.parse(entry.endedAt) > Date.parse(entry.startedAt);

export const createProjectEntrySchema = z
	.strictObject({
		projectId: uuidSchema,
		taskId: uuidSchema.optional(),
		startedAt: instantSchema,
		endedAt: instantSchema,
		// zod alone would only answer "expected string" for the missing note
		note: z
			.string({ error: (iss) => (iss.input === undefined ? 'project.noteRequired' : undefined) })
			.pipe(noteSchema),
		billable: z.boolean().nullable().optional()
	})
	.refine(endsAfterStart, { error: 'project.endBeforeStart', path: ['endedAt'] });

// employee, source and invoice are never writable here
export const updateProjectEntrySchema = z
	.strictObject({
		projectId: uuidSchema,
		taskId: uuidSchema.nullable(),
		startedAt: instantSchema,
		endedAt: instantSchema,
		note: noteSchema.nullable(),
		billable: z.boolean().nullable()
	})
	.partial()
	.refine(endsAfterStart, { error: 'project.endBeforeStart', path: ['endedAt'] });

export const projectTimerSchema = z.discriminatedUnion('state', [
	z.object({ state: z.literal('idle') }),
	z.object({
		state: z.literal('running'),
		entryId: uuidSchema,
		projectId: uuidSchema,
		taskId: uuidSchema.nullable(),
		since: instantSchema,
		hint: z.boolean(),
		budget: budgetStatusSchema.nullable()
	})
]);

export const startTimerSchema = z.strictObject({
	projectId: uuidSchema,
	taskId: uuidSchema.optional(),
	note: noteSchema.optional()
});

export const bookableProjectSchema = z.object({
	id: uuidSchema,
	name: z.string(),
	clientName: z.string(),
	billable: z.boolean(),
	tasks: z.array(z.object({ id: uuidSchema, name: z.string(), billable: z.boolean().nullable() }))
});

export const projectWeekQuerySchema = z.strictObject({ from: isoDateSchema });

const sums = {
	rawMinutes: z.int(),
	roundedMinutes: z.int(),
	amountCents: centsSchema.nullable()
};

export const projectWeekCellSchema = z.object({
	date: isoDateSchema,
	...sums,
	billable: z.boolean(),
	lock: z.enum(['none', 'draft', 'issued']),
	derivation: z.object({
		entries: z.array(
			z.object({ id: uuidSchema, startedAt: instantSchema, endedAt: instantSchema.nullable() })
		),
		rounding: explanationSchema,
		rate: z.object({ cents: centsSchema, explanation: explanationSchema }).nullable()
	})
});

export const projectWeekRowSchema = z.object({
	project: z.object({ id: uuidSchema, name: z.string(), clientName: z.string() }),
	task: z.object({ id: uuidSchema, name: z.string() }).nullable(),
	cells: z.array(projectWeekCellSchema),
	rowTotal: z.object(sums)
});

export const coverageHintSchema = z.enum(['PROJECT_OVER_WORKED', 'PROJECT_OUTSIDE_WORK']);

export const dayCoverageSchema = z.object({
	date: isoDateSchema,
	projectMinutes: z.int(),
	workedMinutes: z.int(),
	coveredMinutes: z.int(),
	outsideMinutes: z.int(),
	unassignedMinutes: z.int(),
	hints: z.array(coverageHintSchema)
});

export const projectWeekSchema = z.object({
	from: isoDateSchema,
	rows: z.array(projectWeekRowSchema),
	dayTotals: z.array(z.object({ date: isoDateSchema, ...sums })),
	weekTotal: z.object(sums),
	// null in a solo workspace, there is no clock to compare against
	coverage: z.array(dayCoverageSchema).nullable(),
	unbilled: z.array(
		z.object({
			clientId: uuidSchema,
			clientName: z.string(),
			minutes: z.int(),
			amountCents: centsSchema.nullable()
		})
	)
});

export const projectSummaryQuerySchema = z
	.strictObject({ team: uuidSchema.optional(), ...rangeShape })
	.superRefine(inRange(62));

// minutes only, team leads get to see no rates
export const projectSummarySchema = z.array(
	z.object({
		employeeId: uuidSchema,
		employeeName: z.string(),
		projectId: uuidSchema,
		projectName: z.string(),
		minutes: z.int(),
		coverage: z.array(dayCoverageSchema)
	})
);

export type Client = z.infer<typeof clientSchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type BudgetState = z.infer<typeof budgetStateSchema>;
export type BudgetStatus = z.infer<typeof budgetStatusSchema>;
export type Project = z.infer<typeof projectSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type Task = z.infer<typeof taskSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type Rate = z.infer<typeof rateSchema>;
export type CreateRateInput = z.infer<typeof createRateSchema>;
export type ProjectEntry = z.infer<typeof projectEntrySchema>;
export type CreateProjectEntryInput = z.infer<typeof createProjectEntrySchema>;
export type UpdateProjectEntryInput = z.infer<typeof updateProjectEntrySchema>;
export type ProjectTimer = z.infer<typeof projectTimerSchema>;
export type StartTimerInput = z.infer<typeof startTimerSchema>;
export type BookableProject = z.infer<typeof bookableProjectSchema>;
export type ProjectWeekQuery = z.infer<typeof projectWeekQuerySchema>;
export type ProjectWeekCell = z.infer<typeof projectWeekCellSchema>;
export type ProjectWeekRow = z.infer<typeof projectWeekRowSchema>;
export type CoverageHint = z.infer<typeof coverageHintSchema>;
export type DayCoverage = z.infer<typeof dayCoverageSchema>;
export type ProjectWeek = z.infer<typeof projectWeekSchema>;
export type ProjectSummaryQuery = z.infer<typeof projectSummaryQuerySchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
